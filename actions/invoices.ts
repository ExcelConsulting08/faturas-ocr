"use server";

import { revalidatePath } from "next/cache";

import { canWrite, requireOrgContext } from "@/lib/auth/context";
import { ingestInvoice, validateFile } from "@/lib/invoices/ingest";
import { syncInvoiceFile } from "@/lib/storage/sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { deliverInvoice } from "@/lib/webhooks/deliver";
import type { Invoice } from "@/types/domain";

export interface UploadResult {
  fileName: string;
  ok: boolean;
  message?: string;
  /** Permite ao browser enviar a seguir a imagem original para esta fatura. */
  invoiceId?: string;
}

export async function uploadInvoices(formData: FormData): Promise<UploadResult[]> {
  const { organization, member } = await requireOrgContext();
  if (!canWrite(member)) throw new Error("Sem permissão para carregar faturas");

  const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File);
  const pais = String(formData.get("pais") ?? "").trim() || null;

  if (files.length === 0) return [];

  const supabase = await createClient();
  const results: UploadResult[] = [];

  for (const file of files) {
    const invalid = validateFile(file.name, file.type, file.size);
    if (invalid) {
      results.push({ fileName: file.name, ok: false, message: invalid });
      continue;
    }

    const outcome = await ingestInvoice(supabase, {
      organizationId: organization.id,
      buffer: Buffer.from(await file.arrayBuffer()),
      fileName: file.name,
      mimeType: file.type,
      origin: "upload",
      pais,
      createdBy: member.user_id,
    });

    results.push({
      fileName: file.name,
      ok: outcome.status !== "falhada",
      message: outcome.error ?? outcome.skippedReason,
      invoiceId: outcome.invoiceId ?? undefined,
    });
  }

  revalidatePath("/invoices");
  revalidatePath("/dashboard");

  return results;
}

export interface InvoiceFormValues {
  numero: string | null;
  moeda: string;
  data_emissao: string | null;
  data_vencimento: string | null;
  pais: string | null;
  fornecedor_nome: string | null;
  fornecedor_nif: string | null;
  fornecedor_iban: string | null;
  cost_center_id: string | null;
  /** Valores tal como impressos no documento — não derivados das linhas. */
  base_tributavel: number;
  iva_total: number;
  total: number;
  linhas: {
    descricao: string | null;
    quantidade: number;
    preco_unitario: number;
    iva_percentagem: number;
    desconto: number;
    outro_imposto: number;
  }[];
}

export async function saveInvoice(invoiceId: string, values: InvoiceFormValues): Promise<void> {
  const { organization, member } = await requireOrgContext();
  if (!canWrite(member)) throw new Error("Sem permissão para editar faturas");

  const supabase = await createClient();

  const { data: current } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("organization_id", organization.id)
    .single<Invoice>();

  if (!current) throw new Error("Fatura não encontrada");

  // Os totais são os que o utilizador tem no ecrã, lidos do documento — nunca
  // recalculados a partir das linhas, que em talões já incluem IVA.
  const baseTributavel = Number(values.base_tributavel.toFixed(2));
  const ivaTotal = Number(values.iva_total.toFixed(2));
  const total = Number(values.total.toFixed(2));

  await supabase
    .from("invoices")
    .update({
      numero: values.numero,
      moeda: values.moeda,
      data_emissao: values.data_emissao,
      data_vencimento: values.data_vencimento,
      pais: values.pais,
      nome_extracted: values.fornecedor_nome,
      nif_extracted: values.fornecedor_nif,
      iban_extracted: values.fornecedor_iban,
      cost_center_id: values.cost_center_id,
      base_tributavel: baseTributavel,
      iva_total: ivaTotal,
      total,
    })
    .eq("id", invoiceId)
    .eq("organization_id", organization.id);

  await supabase.from("invoice_line_items").delete().eq("invoice_id", invoiceId);

  if (values.linhas.length > 0) {
    await supabase.from("invoice_line_items").insert(
      values.linhas.map((linha, index) => ({
        invoice_id: invoiceId,
        organization_id: organization.id,
        posicao: index,
        descricao: linha.descricao,
        quantidade: linha.quantidade,
        preco_unitario: linha.preco_unitario,
        iva_percentagem: linha.iva_percentagem,
        desconto: linha.desconto,
        outro_imposto: linha.outro_imposto,
        total_linha: Number(
          (linha.quantidade * linha.preco_unitario - linha.desconto).toFixed(2),
        ),
      })),
    );
  }

  // O ficheiro acompanha a alteração: renomear se o número mudou, mover se a
  // data ou o país mudaram. Falhas aqui não invalidam a gravação dos dados.
  await syncFileQuietly({
    ...current,
    numero: values.numero,
    pais: values.pais,
    data_emissao: values.data_emissao,
  });

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
}

export async function confirmInvoice(invoiceId: string): Promise<void> {
  const { organization, member } = await requireOrgContext();
  if (!canWrite(member)) throw new Error("Sem permissão para confirmar faturas");

  const supabase = await createClient();
  await supabase
    .from("invoices")
    .update({
      status: "confirmada",
      confirmed_at: new Date().toISOString(),
      confirmed_by: member.user_id,
      is_possible_duplicate: false,
    })
    .eq("id", invoiceId)
    .eq("organization_id", organization.id);

  // Envio para o ERP, se estiver ligado. Uma falha de entrega fica registada em
  // webhook_delivery_log e é retentada pelo cron — não desfaz a confirmação.
  const { data: erp } = await supabase
    .from("erp_integration_settings")
    .select("envio_automatico, webhook_url")
    .eq("organization_id", organization.id)
    .maybeSingle<{ envio_automatico: boolean; webhook_url: string | null }>();

  if (erp?.envio_automatico && erp.webhook_url) {
    await deliverInvoice(createAdminClient(), {
      organizationId: organization.id,
      invoiceId,
    });
  }

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
}

/** Reenvio manual para o ERP, independente do envio automático. */
export async function sendToErp(invoiceId: string): Promise<{ ok: boolean; message: string }> {
  const { organization, member } = await requireOrgContext();
  if (!canWrite(member)) throw new Error("Sem permissão");

  const result = await deliverInvoice(createAdminClient(), {
    organizationId: organization.id,
    invoiceId,
  });

  revalidatePath(`/invoices/${invoiceId}`);

  return {
    ok: result.succeeded,
    message: result.succeeded
      ? `Enviado para o ERP (HTTP ${result.status}).`
      : result.error ?? `O ERP respondeu HTTP ${result.status}.`,
  };
}

export async function discardInvoice(invoiceId: string): Promise<void> {
  const { organization, member } = await requireOrgContext();
  if (!canWrite(member)) throw new Error("Sem permissão para descartar faturas");

  const supabase = await createClient();

  const { data: current } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("organization_id", organization.id)
    .single<Invoice>();

  await supabase
    .from("invoices")
    .update({ discarded_at: new Date().toISOString() })
    .eq("id", invoiceId)
    .eq("organization_id", organization.id);

  // Arquivar em vez de eliminar: a retenção legal exige guardar o documento.
  if (current) {
    await syncFileQuietly({ ...current, discarded_at: new Date().toISOString() });
  }

  revalidatePath("/invoices");
}

export async function setPaymentStatus(
  invoiceId: string,
  paymentStatus: "paga" | "por_pagar",
): Promise<void> {
  const { organization, member } = await requireOrgContext();
  if (!canWrite(member)) throw new Error("Sem permissão para alterar o pagamento");

  const supabase = await createClient();
  await supabase
    .from("invoices")
    .update({ payment_status: paymentStatus })
    .eq("id", invoiceId)
    .eq("organization_id", organization.id);

  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
}

export async function dismissDuplicate(invoiceId: string): Promise<void> {
  const { organization, member } = await requireOrgContext();
  if (!canWrite(member)) throw new Error("Sem permissão");

  const supabase = await createClient();
  await supabase
    .from("invoices")
    .update({ is_possible_duplicate: false })
    .eq("id", invoiceId)
    .eq("organization_id", organization.id);

  revalidatePath("/invoices");
}

/** Sincroniza o ficheiro e persiste o novo caminho, engolindo falhas do Graph. */
async function syncFileQuietly(invoice: Invoice): Promise<void> {
  try {
    const synced = await syncInvoiceFile(invoice);
    if (!synced) return;

    const supabase = await createClient();
    await supabase.from("invoices").update(synced).eq("id", invoice.id);
  } catch {
    // O item mantém-se localizável pelo invoice_id no nome; reconcilia na próxima edição.
  }
}
