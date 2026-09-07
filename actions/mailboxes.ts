"use server";

import { revalidatePath } from "next/cache";

import { pollAllMailboxes } from "@/lib/email-ingest/poll";
import { requireAdmin } from "@/lib/auth/context";
import { graphJson, isGraphConfigured } from "@/lib/graph/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { CountryMailbox } from "@/types/domain";

export interface MailboxState {
  error?: string;
  success?: string;
}

export async function createMailbox(
  _prev: MailboxState,
  formData: FormData,
): Promise<MailboxState> {
  const { organization } = await requireAdmin();

  const pais = String(formData.get("pais") ?? "").trim().toUpperCase();
  const empresa = String(formData.get("empresa") ?? "").trim();
  const idioma = String(formData.get("idioma") ?? "").trim();
  const email = String(formData.get("email_address") ?? "").trim().toLowerCase();

  if (!pais || !empresa || !email) {
    return { error: "Preencha o país, a empresa e o endereço de email." };
  }
  if (pais.length !== 2) {
    return { error: "O país deve ser o código de duas letras (ex. PT, ES, FR, BE)." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("country_mailboxes").insert({
    organization_id: organization.id,
    pais,
    empresa,
    idioma: idioma || "pt",
    email_address: email,
    graph_user_id: email,
  });

  if (error) {
    return {
      error: error.message.includes("duplicate")
        ? "Já existe uma caixa para este país ou endereço."
        : error.message,
    };
  }

  revalidatePath("/mailboxes");
  return { success: `Caixa ${email} adicionada.` };
}

export async function setMailboxActive(mailboxId: string, ativo: boolean): Promise<void> {
  const { organization } = await requireAdmin();

  const supabase = await createClient();
  await supabase
    .from("country_mailboxes")
    .update({ ativo })
    .eq("id", mailboxId)
    .eq("organization_id", organization.id);

  revalidatePath("/mailboxes");
}

export async function deleteMailbox(mailboxId: string): Promise<void> {
  const { organization } = await requireAdmin();

  const supabase = await createClient();
  await supabase
    .from("country_mailboxes")
    .delete()
    .eq("id", mailboxId)
    .eq("organization_id", organization.id);

  revalidatePath("/mailboxes");
}

export async function setCollectionLoop(
  loopAtivo: boolean,
  intervaloSegundos: number,
): Promise<void> {
  const { organization } = await requireAdmin();

  const supabase = await createClient();
  await supabase
    .from("collection_settings")
    .update({
      loop_ativo: loopAtivo,
      intervalo_segundos: Math.min(3600, Math.max(5, intervaloSegundos)),
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organization.id);

  revalidatePath("/mailboxes");
}

/** "Recolher agora": mesmo caminho de código do loop, disparado à mão. */
export async function collectNow(): Promise<{ created: number; skipped: number; errors: string[] }> {
  const { organization } = await requireAdmin();

  const supabase = createAdminClient();
  const summaries = await pollAllMailboxes(supabase, organization.id, "manual");

  revalidatePath("/mailboxes");
  revalidatePath("/invoices");

  return {
    created: summaries.reduce((sum, entry) => sum + entry.invoicesCreated, 0),
    skipped: summaries.reduce((sum, entry) => sum + entry.skipped, 0),
    errors: summaries.filter((entry) => entry.error).map((entry) => `${entry.pais}: ${entry.error}`),
  };
}

/** Revalida o token e confirma que cada caixa responde no Graph. */
export async function syncAccount(): Promise<{ ligadas: number; erros: string[] }> {
  const { organization } = await requireAdmin();

  if (!isGraphConfigured()) {
    return { ligadas: 0, erros: ["Credenciais do Microsoft Graph em falta"] };
  }

  const supabase = await createClient();
  const { data: mailboxes } = await supabase
    .from("country_mailboxes")
    .select("*")
    .eq("organization_id", organization.id)
    .returns<CountryMailbox[]>();

  let ligadas = 0;
  const erros: string[] = [];

  for (const mailbox of mailboxes ?? []) {
    const target = mailbox.graph_user_id || mailbox.email_address;

    try {
      await graphJson(`/users/${encodeURIComponent(target)}?$select=id,mail`);
      ligadas++;
      await supabase
        .from("country_mailboxes")
        .update({ connection_status: "ligada", last_error: null })
        .eq("id", mailbox.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      erros.push(`${mailbox.email_address}: ${message}`);
      await supabase
        .from("country_mailboxes")
        .update({ connection_status: "erro", last_error: message })
        .eq("id", mailbox.id);
    }
  }

  revalidatePath("/mailboxes");
  return { ligadas, erros };
}
