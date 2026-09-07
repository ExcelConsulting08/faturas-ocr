import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { convertToEur } from "@/lib/currency/convert";
import { findDuplicate } from "@/lib/duplicates/detect";
import { decideStatus, type StatusPreferences } from "@/lib/invoices/status";
import { extractInvoice } from "@/lib/ocr/extract";
import type { ExtractionResult } from "@/lib/ocr/schema";
import { isSharePointConfigured, readablePath, uploadFile } from "@/lib/sharepoint/drive";
import { buildFileName, buildFolderPath, extensionFor } from "@/lib/sharepoint/paths";
import { syncInvoiceFile } from "@/lib/sharepoint/sync";
import { normalizeIban } from "@/lib/validators/iban";
import { normalizeNif } from "@/lib/validators/nif";
import type { InvoiceStatus } from "@/types/domain";

export const ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/tiff",
];

export const MAX_FILE_SIZE = 20 * 1024 * 1024;

export interface IngestInput {
  organizationId: string;
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  origin: "upload" | "email";
  pais?: string | null;
  idioma?: string | null;
  createdBy?: string | null;
}

export interface IngestOutcome {
  invoiceId: string | null;
  status: InvoiceStatus;
  skippedReason?: string;
  error?: string;
}

export function validateFile(fileName: string, mimeType: string, size: number): string | null {
  if (!ACCEPTED_MIME_TYPES.includes(mimeType)) {
    return `Tipo de ficheiro não suportado: ${mimeType || "desconhecido"}`;
  }
  if (size > MAX_FILE_SIZE) {
    return `Ficheiro excede o limite de 20MB (${(size / 1024 / 1024).toFixed(1)}MB)`;
  }
  return null;
}

/**
 * Fluxo único de entrada de faturas. O upload manual e a recolha por email
 * partilham este caminho na íntegra: só diferem no `origin` e no `pais`.
 */
export async function ingestInvoice(
  supabase: SupabaseClient,
  input: IngestInput,
): Promise<IngestOutcome> {
  const invalid = validateFile(input.fileName, input.mimeType, input.buffer.byteLength);
  if (invalid) {
    return { invoiceId: null, status: "falhada", skippedReason: invalid };
  }

  // 1. Criar o registo primeiro: dá-nos o id que vai no nome do ficheiro.
  const { data: created, error: insertError } = await supabase
    .from("invoices")
    .insert({
      organization_id: input.organizationId,
      origin: input.origin,
      pais: input.pais ?? null,
      status: "a_processar",
      file_name: input.fileName,
      file_size: input.buffer.byteLength,
      mime_type: input.mimeType,
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single<{ id: string }>();

  if (insertError || !created) {
    return {
      invoiceId: null,
      status: "falhada",
      error: insertError?.message ?? "Não foi possível criar o registo da fatura",
    };
  }

  const invoiceId = created.id;
  const extension = extensionFor(input.fileName, input.mimeType);

  // 2. Guardar o original no SharePoint, ainda em _Entrada (sem data nem número).
  if (isSharePointConfigured()) {
    try {
      const item = await uploadFile({
        folderPath: buildFolderPath({
          organizationId: input.organizationId,
          pais: input.pais,
          dataEmissao: null,
        }),
        fileName: buildFileName({ numero: null, invoiceId, extension }),
        buffer: input.buffer,
        mimeType: input.mimeType,
      });

      await supabase
        .from("invoices")
        .update({
          sharepoint_drive_id: item.parentReference?.driveId ?? null,
          sharepoint_item_id: item.id,
          sharepoint_path: readablePath(item),
          file_name: item.name,
        })
        .eq("id", invoiceId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro no armazenamento";
      await supabase
        .from("invoices")
        .update({ status: "falhada", extraction_error: `Falha ao guardar o ficheiro: ${message}` })
        .eq("id", invoiceId);
      return { invoiceId, status: "falhada", error: message };
    }
  }

  // 3. Extração.
  const extraction = await extractInvoice({
    buffer: input.buffer,
    mimeType: input.mimeType,
    fileName: input.fileName,
    pais: input.pais,
    idioma: input.idioma,
  });

  if (!extraction.result) {
    await supabase
      .from("invoices")
      .update({
        status: "falhada",
        extraction_error: extraction.error,
        extraction_raw: extraction.raw as never,
        confidence_score: 0,
      })
      .eq("id", invoiceId);
    return { invoiceId, status: "falhada", error: extraction.error ?? undefined };
  }

  const result = extraction.result;

  // 4. Fornecedor: reaproveitar por NIF dentro da organização.
  const supplierId = await resolveSupplier(supabase, input.organizationId, result);

  // 5. Regra de centro de custo do fornecedor, se existir.
  const costCenterId = supplierId
    ? await resolveCostCenter(supabase, input.organizationId, supplierId)
    : null;

  // 6. Totais: as linhas mandam, conforme o comportamento esperado na UI.
  const totals = computeTotals(result);
  const moeda = (result.fatura.moeda || "EUR").toUpperCase();
  const { totalEur, rateUsed } = await convertToEur(
    supabase,
    totals.total,
    moeda,
    result.fatura.data_emissao,
  );

  // 7. Estado inicial a partir das preferências da organização.
  const preferences = await loadPreferences(supabase, input.organizationId);
  const status = decideStatus(extraction.confidence, preferences);

  await supabase
    .from("invoices")
    .update({
      supplier_id: supplierId,
      cost_center_id: costCenterId,
      status,
      numero: result.fatura.numero,
      is_credit_note: result.fatura.is_credit_note ?? false,
      moeda,
      data_emissao: result.fatura.data_emissao,
      data_vencimento: result.fatura.data_vencimento,
      nome_extracted: result.fornecedor.nome,
      nif_extracted: normalizeNif(result.fornecedor.nif),
      iban_extracted: normalizeIban(result.fornecedor.iban),
      base_tributavel: totals.baseTributavel,
      iva_total: totals.ivaTotal,
      total: totals.total,
      total_eur: totalEur,
      fx_rate_used: rateUsed,
      confidence_score: extraction.confidence,
      extraction_raw: extraction.raw as never,
      validation_flags: extraction.validationFlags as never,
      extraction_error: null,
    })
    .eq("id", invoiceId);

  // 8. Linhas.
  if (result.linhas.length > 0) {
    await supabase.from("invoice_line_items").insert(
      result.linhas.map((linha, index) => ({
        invoice_id: invoiceId,
        organization_id: input.organizationId,
        posicao: index,
        descricao: linha.descricao,
        quantidade: linha.quantidade ?? 1,
        preco_unitario: linha.preco_unitario ?? 0,
        iva_percentagem: linha.iva_percentagem ?? 0,
        desconto: linha.desconto ?? 0,
        outro_imposto: linha.outro_imposto ?? 0,
        total_linha: linha.total_linha ?? 0,
      })),
    );
  }

  // 9. Duplicados.
  const duplicateOf = await findDuplicate(supabase, {
    organizationId: input.organizationId,
    invoiceId,
    supplierId,
    numero: result.fatura.numero,
    total: totals.total,
  });

  if (duplicateOf) {
    await supabase
      .from("invoices")
      .update({ is_possible_duplicate: true, duplicate_of_invoice_id: duplicateOf })
      .eq("id", invoiceId);
  }

  // 10. Mover o ficheiro para a pasta definitiva, agora que há número e data.
  try {
    const synced = await syncInvoiceFile({
      id: invoiceId,
      organization_id: input.organizationId,
      sharepoint_item_id: (
        await supabase
          .from("invoices")
          .select("sharepoint_item_id")
          .eq("id", invoiceId)
          .single<{ sharepoint_item_id: string | null }>()
      ).data?.sharepoint_item_id ?? null,
      numero: result.fatura.numero,
      pais: input.pais ?? null,
      data_emissao: result.fatura.data_emissao,
      file_name: input.fileName,
      mime_type: input.mimeType,
      discarded_at: null,
    });

    if (synced) {
      await supabase.from("invoices").update(synced).eq("id", invoiceId);
    }
  } catch {
    // O ficheiro fica em _Entrada com o id no nome: continua rastreável e será
    // reconciliado na próxima edição. Não vale a pena falhar a ingestão por isto.
  }

  return { invoiceId, status };
}

function computeTotals(result: ExtractionResult) {
  const linhasBase = result.linhas.reduce((sum, linha) => sum + (linha.total_linha ?? 0), 0);
  const linhasIva = result.linhas.reduce(
    (sum, linha) => sum + ((linha.total_linha ?? 0) * (linha.iva_percentagem ?? 0)) / 100,
    0,
  );

  // As linhas são a fonte de verdade; os totais do documento são o recurso
  // quando a fatura não discrimina linhas.
  const baseTributavel = linhasBase > 0 ? linhasBase : result.totais.base_tributavel ?? 0;
  const ivaTotal = linhasBase > 0 ? linhasIva : result.totais.iva_total ?? 0;
  const total =
    linhasBase > 0 ? baseTributavel + ivaTotal : result.totais.total ?? baseTributavel + ivaTotal;

  return {
    baseTributavel: Number(baseTributavel.toFixed(2)),
    ivaTotal: Number(ivaTotal.toFixed(2)),
    total: Number(total.toFixed(2)),
  };
}

async function resolveSupplier(
  supabase: SupabaseClient,
  organizationId: string,
  result: ExtractionResult,
): Promise<string | null> {
  const nif = normalizeNif(result.fornecedor.nif);
  const nome = result.fornecedor.nome;
  if (!nif && !nome) return null;

  if (nif) {
    const { data: existing } = await supabase
      .from("suppliers")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("nif", nif)
      .maybeSingle<{ id: string }>();

    if (existing) return existing.id;
  }

  const { data: inserted } = await supabase
    .from("suppliers")
    .insert({
      organization_id: organizationId,
      nome: nome ?? `Fornecedor ${nif}`,
      nif,
      iban: normalizeIban(result.fornecedor.iban),
    })
    .select("id")
    .single<{ id: string }>();

  return inserted?.id ?? null;
}

async function resolveCostCenter(
  supabase: SupabaseClient,
  organizationId: string,
  supplierId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("cost_center_rules")
    .select("cost_center_id")
    .eq("organization_id", organizationId)
    .eq("supplier_id", supplierId)
    .maybeSingle<{ cost_center_id: string }>();

  return data?.cost_center_id ?? null;
}

async function loadPreferences(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<StatusPreferences> {
  const { data } = await supabase
    .from("extraction_preferences")
    .select("modo, limiar_alto, limiar_baixo")
    .eq("organization_id", organizationId)
    .maybeSingle<StatusPreferences>();

  return data ?? { modo: "automatico", limiar_alto: 0.9, limiar_baixo: 0.6 };
}

