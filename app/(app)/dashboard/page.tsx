import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { Card } from "@/components/ui/primitives";
import { requireOrgContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/utils";
import type { Invoice } from "@/types/domain";

export const dynamic = "force-dynamic";

type Row = Pick<
  Invoice,
  | "status"
  | "payment_status"
  | "moeda"
  | "total"
  | "total_eur"
  | "base_tributavel"
  | "iva_total"
  | "data_emissao"
  | "pais"
  | "cost_center_id"
>;

export default async function DashboardPage() {
  const { organization } = await requireOrgContext();
  const supabase = await createClient();

  const [invoicesResult, centersResult] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "status, payment_status, moeda, total, total_eur, base_tributavel, iva_total, data_emissao, pais, cost_center_id",
      )
      .eq("organization_id", organization.id)
      .is("discarded_at", null)
      .returns<Row[]>(),
    supabase
      .from("cost_centers")
      .select("id, nome")
      .eq("organization_id", organization.id)
      .returns<{ id: string; nome: string }[]>(),
  ]);

  const rows = invoicesResult.data ?? [];
  const centerNames = new Map((centersResult.data ?? []).map((c) => [c.id, c.nome]));

  const eur = (row: Row) => Number(row.total_eur ?? 0);
  const volumeTotal = rows.reduce((sum, row) => sum + eur(row), 0);
  const porPagar = rows.filter((row) => row.payment_status === "por_pagar");
  const pagas = rows.filter((row) => row.payment_status === "paga");
  const requeremAtencao = rows.filter(
    (row) => row.status === "por_rever" || row.status === "falhada",
  ).length;

  // Últimos 12 meses, incluindo os meses sem faturas para o gráfico não ter buracos.
  const now = new Date();
  const gastosPorMes = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (11 - index), 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const total = rows
      .filter((row) => row.data_emissao?.startsWith(key))
      .reduce((sum, row) => sum + eur(row), 0);
    return { mes: key.slice(5) + "/" + key.slice(2, 4), total: Number(total.toFixed(2)) };
  });

  const groupBy = (keyFn: (row: Row) => string) => {
    const map = new Map<string, { count: number; total: number }>();
    for (const row of rows) {
      const key = keyFn(row);
      const current = map.get(key) ?? { count: 0, total: 0 };
      map.set(key, { count: current.count + 1, total: current.total + eur(row) });
    }
    return [...map.entries()]
      .map(([nome, value]) => ({ nome, ...value, total: Number(value.total.toFixed(2)) }))
      .sort((a, b) => b.total - a.total);
  };

  const STATUS_LABELS: Record<string, string> = {
    auto_confirmada: "Auto-confirmada",
    confirmada: "Confirmada",
    por_rever: "Por rever",
    falhada: "Falhada",
    a_processar: "A processar",
  };

  const baseTributavel = rows.reduce((sum, row) => sum + Number(row.base_tributavel), 0);
  const ivaTotal = rows.reduce((sum, row) => sum + Number(row.iva_total), 0);

  return (
    <div className="space-y-5 p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="flex flex-wrap gap-1.5">
        <Card className="min-w-[130px] flex-1 p-3">
          <p className="text-xs text-muted">Total faturas</p>
          <p className="mt-0.5 text-lg font-semibold">{rows.length}</p>
        </Card>
        <Card className="min-w-[130px] flex-1 p-3">
          <p className="text-xs text-muted">Requerem atenção</p>
          <p className="mt-0.5 text-lg font-semibold text-primary">{requeremAtencao}</p>
        </Card>
        <Card className="min-w-[130px] flex-1 p-3">
          <p className="text-xs text-muted">Volume total</p>
          <p className="mt-0.5 text-lg font-semibold">{formatNumber(volumeTotal)} EUR</p>
        </Card>
        <Card className="min-w-[130px] flex-1 p-3">
          <p className="text-xs text-muted">Por pagar</p>
          <p className="mt-0.5 text-lg font-semibold text-amber-600">
            {formatNumber(porPagar.reduce((sum, row) => sum + eur(row), 0))} EUR
          </p>
        </Card>
        <Card className="min-w-[130px] flex-1 p-3">
          <p className="text-xs text-muted">Pagas</p>
          <p className="mt-0.5 text-lg font-semibold text-emerald-600">
            {formatNumber(pagas.reduce((sum, row) => sum + eur(row), 0))} EUR
          </p>
        </Card>
      </div>

      <DashboardCharts
        gastosPorMes={gastosPorMes}
        estados={groupBy((row) => STATUS_LABELS[row.status] ?? row.status)}
        centros={groupBy((row) =>
          row.cost_center_id ? centerNames.get(row.cost_center_id) ?? "—" : "Sem centro de custo",
        )}
        paises={groupBy((row) => row.pais ?? "Sem país")}
        pagamento={[
          { nome: "Pagas", count: pagas.length, total: 0 },
          { nome: "Por pagar", count: porPagar.length, total: 0 },
        ]}
        iva={{ base: baseTributavel, iva: ivaTotal }}
      />
    </div>
  );
}
