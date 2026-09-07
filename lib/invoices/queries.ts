import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Invoice, InvoiceStatus } from "@/types/domain";

export const PAGE_SIZE = 20;

export interface InvoiceFilters {
  search?: string;
  periodo?: "mes" | "trimestre" | "ano" | "tudo";
  estado?: InvoiceStatus | "todos";
  pagamento?: "paga" | "por_pagar" | "todos";
  pais?: string;
  costCenter?: string;
  page?: number;
}

export interface InvoiceListRow extends Invoice {
  suppliers: { nome: string; nif: string | null } | null;
  cost_centers: { nome: string; cor: string | null } | null;
}

/** Data de início do período selecionado, ou null para "tudo". */
export function periodStart(periodo: InvoiceFilters["periodo"]): string | null {
  const now = new Date();

  switch (periodo) {
    case "mes":
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    case "trimestre":
      return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString();
    case "ano":
      return new Date(now.getFullYear(), 0, 1).toISOString();
    default:
      return null;
  }
}

export async function fetchInvoices(
  supabase: SupabaseClient,
  organizationId: string,
  filters: InvoiceFilters,
): Promise<{ rows: InvoiceListRow[]; total: number }> {
  const page = filters.page ?? 1;
  const from = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("invoices")
    .select("*, suppliers(nome, nif), cost_centers(nome, cor)", { count: "exact" })
    .eq("organization_id", organizationId)
    .is("discarded_at", null);

  const start = periodStart(filters.periodo);
  if (start) query = query.gte("entrada_at", start);

  if (filters.estado && filters.estado !== "todos") query = query.eq("status", filters.estado);
  if (filters.pagamento && filters.pagamento !== "todos") {
    query = query.eq("payment_status", filters.pagamento);
  }
  if (filters.pais) query = query.eq("pais", filters.pais);
  if (filters.costCenter) query = query.eq("cost_center_id", filters.costCenter);

  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.or(`numero.ilike.${term},nome_extracted.ilike.${term}`);
  }

  const { data, count } = await query
    .order("entrada_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1)
    .returns<InvoiceListRow[]>();

  return { rows: data ?? [], total: count ?? 0 };
}

export interface CurrencyTotal {
  moeda: string;
  total: number;
}

export interface InvoiceStats {
  totalCount: number;
  totals: CurrencyTotal[];
  porRever: { count: number; totals: CurrencyTotal[] };
  confirmadas: { count: number; totals: CurrencyTotal[] };
  porPagar: { count: number; totals: CurrencyTotal[] };
  pagas: { count: number; totals: CurrencyTotal[] };
  duplicados: number;
}

/**
 * Estatísticas agregadas por moeda. Feito em memória sobre as faturas do
 * período: a alternativa seriam cinco queries agregadas, e a estas dimensões
 * o ganho não compensa a complexidade.
 */
export async function fetchStats(
  supabase: SupabaseClient,
  organizationId: string,
  filters: InvoiceFilters,
): Promise<InvoiceStats> {
  let query = supabase
    .from("invoices")
    .select("status, payment_status, moeda, total, is_possible_duplicate")
    .eq("organization_id", organizationId)
    .is("discarded_at", null);

  const start = periodStart(filters.periodo);
  if (start) query = query.gte("entrada_at", start);

  const { data } = await query.returns<
    Pick<Invoice, "status" | "payment_status" | "moeda" | "total" | "is_possible_duplicate">[]
  >();

  const rows = data ?? [];

  const sumByCurrency = (subset: typeof rows): CurrencyTotal[] => {
    const map = new Map<string, number>();
    for (const row of subset) {
      map.set(row.moeda, (map.get(row.moeda) ?? 0) + Number(row.total));
    }
    return [...map.entries()]
      .map(([moeda, total]) => ({ moeda, total }))
      .sort((a, b) => b.total - a.total);
  };

  const porRever = rows.filter((row) => row.status === "por_rever");
  const confirmadas = rows.filter(
    (row) => row.status === "confirmada" || row.status === "auto_confirmada",
  );
  const porPagar = rows.filter((row) => row.payment_status === "por_pagar");
  const pagas = rows.filter((row) => row.payment_status === "paga");

  return {
    totalCount: rows.length,
    totals: sumByCurrency(rows),
    porRever: { count: porRever.length, totals: sumByCurrency(porRever) },
    confirmadas: { count: confirmadas.length, totals: sumByCurrency(confirmadas) },
    porPagar: { count: porPagar.length, totals: sumByCurrency(porPagar) },
    pagas: { count: pagas.length, totals: sumByCurrency(pagas) },
    duplicados: rows.filter((row) => row.is_possible_duplicate).length,
  };
}
