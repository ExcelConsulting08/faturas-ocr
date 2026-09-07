import { CostCentersManager } from "@/components/cost-centers/cost-centers-manager";
import { Card } from "@/components/ui/primitives";
import { canWrite, requireOrgContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { CostCenter, Supplier } from "@/types/domain";

export const dynamic = "force-dynamic";

export interface CostCenterWithCounts extends CostCenter {
  invoiceCount: number;
  ruleCount: number;
}

export interface RuleRow {
  id: string;
  supplier: { id: string; nome: string } | null;
  cost_center: { id: string; nome: string } | null;
}

export default async function CentrosCustoPage() {
  const { organization, member } = await requireOrgContext();
  const supabase = await createClient();

  const [centersResult, rulesResult, suppliersResult, invoicesResult] = await Promise.all([
    supabase
      .from("cost_centers")
      .select("*")
      .eq("organization_id", organization.id)
      .order("nome")
      .returns<CostCenter[]>(),
    supabase
      .from("cost_center_rules")
      .select("id, supplier:suppliers(id, nome), cost_center:cost_centers(id, nome)")
      .eq("organization_id", organization.id)
      .returns<RuleRow[]>(),
    supabase
      .from("suppliers")
      .select("*")
      .eq("organization_id", organization.id)
      .order("nome")
      .returns<Supplier[]>(),
    supabase
      .from("invoices")
      .select("cost_center_id")
      .eq("organization_id", organization.id)
      .is("discarded_at", null)
      .returns<{ cost_center_id: string | null }[]>(),
  ]);

  const invoices = invoicesResult.data ?? [];
  const rules = rulesResult.data ?? [];

  const centers: CostCenterWithCounts[] = (centersResult.data ?? []).map((center) => ({
    ...center,
    invoiceCount: invoices.filter((row) => row.cost_center_id === center.id).length,
    ruleCount: rules.filter((rule) => rule.cost_center?.id === center.id).length,
  }));

  const porClassificar = invoices.filter((row) => !row.cost_center_id).length;

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Centro de Custos</h1>
        <p className="text-sm text-muted">
          Divida as despesas por centro e crie regras que classificam automaticamente as faturas de
          cada fornecedor.
        </p>
      </div>

      <div className="flex gap-3">
        <Card className="flex-1 p-4">
          <p className="text-sm text-muted">Centros ativos</p>
          <p className="mt-1 text-2xl font-semibold">{centers.length}</p>
        </Card>
        <Card className="flex-1 p-4">
          <p className="text-sm text-muted">Faturas por classificar</p>
          <p className="mt-1 text-2xl font-semibold text-amber-600">{porClassificar}</p>
        </Card>
      </div>

      <CostCentersManager
        centers={centers}
        rules={rules}
        suppliers={suppliersResult.data ?? []}
        readOnly={!canWrite(member)}
      />
    </div>
  );
}
