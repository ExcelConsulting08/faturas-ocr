"use server";

import { revalidatePath } from "next/cache";

import { canWrite, requireOrgContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

const PALETTE = ["#f59e0b", "#6366f1", "#10b981", "#ef4444", "#0ea5e9", "#8b5cf6"];

export async function createCostCenter(formData: FormData): Promise<void> {
  const { organization, member } = await requireOrgContext();
  if (!canWrite(member)) throw new Error("Sem permissão");

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) throw new Error("Indique o nome do centro de custo");

  const supabase = await createClient();

  const { count } = await supabase
    .from("cost_centers")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organization.id);

  await supabase.from("cost_centers").insert({
    organization_id: organization.id,
    nome,
    cor: PALETTE[(count ?? 0) % PALETTE.length],
  });

  revalidatePath("/centros-custo");
}

export async function deleteCostCenter(costCenterId: string): Promise<void> {
  const { organization, member } = await requireOrgContext();
  if (!canWrite(member)) throw new Error("Sem permissão");

  const supabase = await createClient();
  await supabase
    .from("cost_centers")
    .delete()
    .eq("id", costCenterId)
    .eq("organization_id", organization.id);

  revalidatePath("/centros-custo");
}

/**
 * Cria a regra "associar sempre este fornecedor a este centro de custo" e
 * aplica-a retroativamente às faturas ainda por classificar do mesmo fornecedor.
 */
export async function createSupplierRule(
  supplierId: string,
  costCenterId: string,
): Promise<void> {
  const { organization, member } = await requireOrgContext();
  if (!canWrite(member)) throw new Error("Sem permissão");

  const supabase = await createClient();

  await supabase.from("cost_center_rules").upsert(
    {
      organization_id: organization.id,
      supplier_id: supplierId,
      cost_center_id: costCenterId,
    },
    { onConflict: "organization_id,supplier_id" },
  );

  await supabase
    .from("invoices")
    .update({ cost_center_id: costCenterId })
    .eq("organization_id", organization.id)
    .eq("supplier_id", supplierId)
    .is("cost_center_id", null);

  revalidatePath("/centros-custo");
  revalidatePath("/invoices");
}

export async function deleteSupplierRule(ruleId: string): Promise<void> {
  const { organization, member } = await requireOrgContext();
  if (!canWrite(member)) throw new Error("Sem permissão");

  const supabase = await createClient();
  await supabase
    .from("cost_center_rules")
    .delete()
    .eq("id", ruleId)
    .eq("organization_id", organization.id);

  revalidatePath("/centros-custo");
}
