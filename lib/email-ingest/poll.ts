import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { graphJson } from "@/lib/graph/client";
import { ACCEPTED_MIME_TYPES, MAX_FILE_SIZE, ingestInvoice } from "@/lib/invoices/ingest";
import type { CountryMailbox } from "@/types/domain";

/** Teto por execução: mantém cada ciclo dentro do minuto disponível. */
const MAX_MESSAGES_PER_RUN = 15;

interface GraphMessage {
  id: string;
  subject?: string;
  hasAttachments?: boolean;
}

interface GraphAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  contentBytes?: string;
  "@odata.type"?: string;
}

export interface PollSummary {
  mailboxId: string;
  pais: string;
  messagesSeen: number;
  invoicesCreated: number;
  skipped: number;
  error?: string;
}

export async function pollAllMailboxes(
  supabase: SupabaseClient,
  organizationId: string,
  trigger: "loop" | "manual",
): Promise<PollSummary[]> {
  const { data: mailboxes } = await supabase
    .from("country_mailboxes")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("ativo", true)
    .returns<CountryMailbox[]>();

  const summaries: PollSummary[] = [];

  for (const mailbox of mailboxes ?? []) {
    summaries.push(await pollMailbox(supabase, mailbox, trigger));
  }

  return summaries;
}

export async function pollMailbox(
  supabase: SupabaseClient,
  mailbox: CountryMailbox,
  trigger: "loop" | "manual",
): Promise<PollSummary> {
  const { data: run } = await supabase
    .from("collection_runs")
    .insert({
      organization_id: mailbox.organization_id,
      mailbox_id: mailbox.id,
      trigger,
    })
    .select("id")
    .single<{ id: string }>();

  const summary: PollSummary = {
    mailboxId: mailbox.id,
    pais: mailbox.pais,
    messagesSeen: 0,
    invoicesCreated: 0,
    skipped: 0,
  };

  try {
    const target = mailbox.graph_user_id || mailbox.email_address;

    // Só mensagens por ler: a marcação como lida no fim é o que fecha o ciclo.
    const messages = await graphJson<{ value: GraphMessage[] }>(
      `/users/${encodeURIComponent(target)}/mailFolders/inbox/messages` +
        `?$filter=isRead eq false and hasAttachments eq true` +
        `&$select=id,subject,hasAttachments&$top=${MAX_MESSAGES_PER_RUN}`,
    );

    for (const message of messages.value) {
      summary.messagesSeen++;
      await processMessage(supabase, mailbox, message, summary);

      await graphJson(`/users/${encodeURIComponent(target)}/messages/${message.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRead: true }),
      });
    }

    await supabase
      .from("country_mailboxes")
      .update({
        last_polled_at: new Date().toISOString(),
        connection_status: "ligada",
        last_error: null,
      })
      .eq("id", mailbox.id);
  } catch (error) {
    summary.error = error instanceof Error ? error.message : "Erro desconhecido";

    await supabase
      .from("country_mailboxes")
      .update({
        last_polled_at: new Date().toISOString(),
        connection_status: "erro",
        last_error: summary.error,
      })
      .eq("id", mailbox.id);
  }

  if (run) {
    await supabase
      .from("collection_runs")
      .update({
        finished_at: new Date().toISOString(),
        messages_seen: summary.messagesSeen,
        invoices_created: summary.invoicesCreated,
        skipped: summary.skipped,
        error_message: summary.error ?? null,
      })
      .eq("id", run.id);
  }

  return summary;
}

async function processMessage(
  supabase: SupabaseClient,
  mailbox: CountryMailbox,
  message: GraphMessage,
  summary: PollSummary,
): Promise<void> {
  const target = mailbox.graph_user_id || mailbox.email_address;

  const attachments = await graphJson<{ value: GraphAttachment[] }>(
    `/users/${encodeURIComponent(target)}/messages/${message.id}/attachments`,
  );

  for (const attachment of attachments.value) {
    // Idempotência: a chave única em (message, attachment) impede reprocessar
    // o mesmo anexo se duas execuções se sobrepuserem ou houver retry.
    const { data: already } = await supabase
      .from("email_ingest_log")
      .select("id")
      .eq("graph_message_id", message.id)
      .eq("attachment_id", attachment.id)
      .maybeSingle<{ id: string }>();

    if (already) continue;

    const log = {
      organization_id: mailbox.organization_id,
      mailbox_id: mailbox.id,
      graph_message_id: message.id,
      attachment_id: attachment.id,
    };

    if (!attachment.contentBytes) {
      summary.skipped++;
      await supabase.from("email_ingest_log").insert({
        ...log,
        status: "ignorado",
        motivo: "Anexo sem conteúdo (referência externa ou item de correio)",
      });
      continue;
    }

    if (!ACCEPTED_MIME_TYPES.includes(attachment.contentType)) {
      summary.skipped++;
      await supabase.from("email_ingest_log").insert({
        ...log,
        status: "ignorado",
        motivo: `Tipo de ficheiro não suportado: ${attachment.contentType}`,
      });
      continue;
    }

    if (attachment.size > MAX_FILE_SIZE) {
      summary.skipped++;
      await supabase.from("email_ingest_log").insert({
        ...log,
        status: "ignorado",
        motivo: `Excede o limite de 20MB (${(attachment.size / 1024 / 1024).toFixed(1)}MB)`,
      });
      continue;
    }

    // A partir daqui é exatamente o mesmo caminho do upload manual.
    const outcome = await ingestInvoice(supabase, {
      organizationId: mailbox.organization_id,
      buffer: Buffer.from(attachment.contentBytes, "base64"),
      fileName: attachment.name,
      mimeType: attachment.contentType,
      origin: "email",
      pais: mailbox.pais,
      idioma: mailbox.idioma,
    });

    if (outcome.invoiceId && outcome.status !== "falhada") {
      summary.invoicesCreated++;
    } else {
      summary.skipped++;
    }

    await supabase.from("email_ingest_log").insert({
      ...log,
      invoice_id: outcome.invoiceId,
      status: outcome.error ? "erro" : "ingerido",
      motivo: outcome.error ?? outcome.skippedReason ?? null,
    });
  }
}
