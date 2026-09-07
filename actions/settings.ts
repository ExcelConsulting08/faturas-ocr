"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requireAdmin, requireOrgContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { ExtractionMode } from "@/types/domain";

export interface SettingsState {
  error?: string;
  success?: string;
}

export async function updateOrganization(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { organization } = await requireAdmin();

  const nome = String(formData.get("nome") ?? "").trim();
  const nif = String(formData.get("nif") ?? "").trim();
  if (!nome || !nif) return { error: "Indique o nome e o NIF." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ nome, nif })
    .eq("id", organization.id);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: "Organização atualizada." };
}

export async function updateExtractionPreferences(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { organization } = await requireAdmin();

  const modo = String(formData.get("modo") ?? "automatico") as ExtractionMode;
  const limiarAlto = Number(formData.get("limiar_alto"));
  const limiarBaixo = Number(formData.get("limiar_baixo"));

  if (!Number.isFinite(limiarAlto) || !Number.isFinite(limiarBaixo)) {
    return { error: "Os limiares têm de ser números." };
  }
  if (limiarAlto < 0 || limiarAlto > 1 || limiarBaixo < 0 || limiarBaixo > 1) {
    return { error: "Os limiares têm de estar entre 0 e 1." };
  }
  if (limiarBaixo > limiarAlto) {
    return { error: "O limiar baixo não pode ser superior ao limiar alto." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("extraction_preferences")
    .update({ modo, limiar_alto: limiarAlto, limiar_baixo: limiarBaixo })
    .eq("organization_id", organization.id);

  if (error) return { error: error.message };

  revalidatePath("/definicoes");
  return { success: "Preferências guardadas." };
}

export async function updateErpSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { organization } = await requireAdmin();

  const webhookUrl = String(formData.get("webhook_url") ?? "").trim();
  const envioAutomatico = formData.get("envio_automatico") === "on";

  if (webhookUrl && !/^https?:\/\//.test(webhookUrl)) {
    return { error: "O URL do webhook tem de começar por http:// ou https://" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("erp_integration_settings")
    .update({ webhook_url: webhookUrl || null, envio_automatico: envioAutomatico })
    .eq("organization_id", organization.id);

  if (error) return { error: error.message };

  revalidatePath("/definicoes");
  return { success: "Integração ERP guardada." };
}

export async function regenerateErpSecret(): Promise<void> {
  const { organization } = await requireAdmin();

  const supabase = await createClient();
  await supabase
    .from("erp_integration_settings")
    .update({ secret: randomBytes(32).toString("hex") })
    .eq("organization_id", organization.id);

  revalidatePath("/definicoes");
}

export async function changeOwnPassword(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  await requireOrgContext();

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) return { error: "A password deve ter pelo menos 8 caracteres." };
  if (password !== confirm) return { error: "As passwords não coincidem." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password,
    data: { must_change_password: false },
  });

  if (error) return { error: error.message };

  return { success: "Password alterada." };
}
