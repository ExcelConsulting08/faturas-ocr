import type { SupabaseClient } from "@supabase/supabase-js";

/** Tolerância no total para considerar duas faturas iguais (arredondamentos do OCR). */
const TOTAL_TOLERANCE = 0.02;

export function normalizeNumero(numero: string | null | undefined): string | null {
  if (!numero) return null;
  const clean = numero.replace(/[\s\-/.]/g, "").toUpperCase();
  return clean.length > 0 ? clean : null;
}

/**
 * Procura uma fatura já existente do mesmo fornecedor, com o mesmo número e um
 * total equivalente. Devolve o id da candidata mais antiga, ou null.
 */
export async function findDuplicate(
  supabase: SupabaseClient,
  options: {
    organizationId: string;
    invoiceId: string;
    supplierId: string | null;
    numero: string | null;
    total: number | null;
  },
): Promise<string | null> {
  const numero = normalizeNumero(options.numero);
  if (!options.supplierId || !numero || options.total === null) return null;

  const { data } = await supabase
    .from("invoices")
    .select("id, numero, total")
    .eq("organization_id", options.organizationId)
    .eq("supplier_id", options.supplierId)
    .neq("id", options.invoiceId)
    .is("discarded_at", null)
    .order("created_at", { ascending: true })
    .limit(200);

  if (!data) return null;

  const match = data.find(
    (candidate: { id: string; numero: string | null; total: number }) =>
      normalizeNumero(candidate.numero) === numero &&
      Math.abs(Number(candidate.total) - options.total!) <= TOTAL_TOLERANCE,
  );

  return match?.id ?? null;
}
