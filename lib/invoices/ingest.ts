import "server-only";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { convertToEur } from "@/lib/currency/convert";
import { findDuplicate } from "@/lib/duplicates/detect";
import { formatPageRange, validatePageRanges, type PageRange } from "@/lib/invoices/page-ranges";
import { extractPages, pageCountOf } from "@/lib/invoices/split-pdf";
import { decideStatus, type StatusPreferences } from "@/lib/invoices/status";
import { extractInvoice, type ExtractedInvoice } from "@/lib/ocr/extract";
import type { ExtractionResult } from "@/lib/ocr/schema";
import { buildFileName, buildFolderPath, extensionFor } from "@/lib/sharepoint/paths";
import { getStorage } from "@/lib/storage";
import { syncInvoiceFile } from "@/lib/storage/sync";
import { normalizeIban } from "@/lib/validators/iban";
import { normalizeNif } from "@/lib/validators/nif";
import type { Invoice, InvoiceStatus } from "@/types/domain";

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

/**
 * Teto de faturas por ficheiro. Não é um limite de negócio — é um travão para
 * o caso de o modelo se descontrolar e "encontrar" dezenas de faturas onde não
 * as há, o que criaria dezenas de registos falsos na contabilidade.
 */
const MAX_INVOICES_PER_FILE = 25;

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
  /** Um id por fatura criada — o ficheiro pode conter mais do que uma. */
  invoiceIds: string[];
  /** A primeira fatura criada; no caso simples é a única. */
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
 *
 * Um ficheiro pode trazer mais do que uma fatura — um lote enviado pelo
 * fornecedor, ou uma digitalização de vários documentos de uma vez. Cada fatura
 * dá origem ao seu próprio registo, com o seu próprio ficheiro, para depois se
 * comportar em tudo como uma fatura que chegou sozinha.
 */
export async function ingestInvoice(
  supabase: SupabaseClient,
  input: IngestInput,
): Promise<IngestOutcome> {
  const invalid = validateFile(input.fileName, input.mimeType, input.buffer.byteLength);
  if (invalid) {
    return { invoiceIds: [], invoiceId: null, status: "falhada", skippedReason: invalid };
  }

  // 1. Criar o primeiro registo: dá-nos o id que vai no nome do ficheiro, e é
  //    onde a falha fica registada se a extração não chegar a produzir nada.
  const primeiroId = await createPlaceholder(supabase, input);
  if (!primeiroId.id) {
    return { invoiceIds: [], invoiceId: null, status: "falhada", error: primeiroId.error };
  }

  const invoiceId = primeiroId.id;
  const extension = extensionFor(input.fileName, input.mimeType);
  const storage = getStorage();

  // 2. Guardar o documento como chegou, ainda em _Entrada. Quando o ficheiro
  //    trouxer várias faturas, é este o original a que todas remetem.
  let origem: { id: string; container: string; path: string; name: string };
  try {
    origem = await storage.upload({
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
        storage_provider: storage.provider,
        storage_container: origem.container,
        storage_id: origem.id,
        storage_path: origem.path,
        file_name: origem.name,
      })
      .eq("id", invoiceId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro no armazenamento";
    await supabase
      .from("invoices")
      .update({ status: "falhada", extraction_error: `Falha ao guardar o ficheiro: ${message}` })
      .eq("id", invoiceId);
    return { invoiceIds: [invoiceId], invoiceId, status: "falhada", error: message };
  }

  // 3. Extração. O número de páginas ajuda o modelo a situar os intervalos e
  //    serve-nos depois para os validar.
  const pageCount = await pageCountOf(input.buffer, input.mimeType);
  const extraction = await extractInvoice({
    buffer: input.buffer,
    mimeType: input.mimeType,
    fileName: input.fileName,
    pais: input.pais,
    idioma: input.idioma,
    pageCount,
  });

  if (extraction.invoices.length === 0) {
    await supabase
      .from("invoices")
      .update({
        status: "falhada",
        extraction_error: extraction.error,
        extraction_raw: extraction.raw as never,
        confidence_score: 0,
      })
      .eq("id", invoiceId);
    return {
      invoiceIds: [invoiceId],
      invoiceId,
      status: "falhada",
      error: extraction.error ?? undefined,
    };
  }

  if (extraction.invoices.length > MAX_INVOICES_PER_FILE) {
    const motivo = `O documento foi lido como tendo ${extraction.invoices.length} faturas, acima do limite de ${MAX_INVOICES_PER_FILE}. Divida o ficheiro e volte a carregar.`;
    await supabase
      .from("invoices")
      .update({ status: "falhada", extraction_error: motivo, confidence_score: 0 })
      .eq("id", invoiceId);
    return { invoiceIds: [invoiceId], invoiceId, status: "falhada", error: motivo };
  }

  const documentos = extraction.invoices;
  const multiplas = documentos.length > 1;

  // 4. Intervalos de páginas. Null quando não são de confiança — nesse caso
  //    cada registo fica com uma cópia do documento inteiro em vez de uma
  //    fatia possivelmente errada.
  const ranges = validatePageRanges(
    documentos.map((doc) => ({
      pagina_inicio: doc.result.pagina_inicio,
      pagina_fim: doc.result.pagina_fim,
    })),
    pageCount ?? 0,
  );

  const preferences = await loadPreferences(supabase, input.organizationId);
  const sourceGroupId = multiplas ? randomUUID() : null;
  const criados: string[] = [];
  let primeiroStatus: InvoiceStatus = "por_rever";

  for (const [indice, documento] of documentos.entries()) {
    // O primeiro documento reaproveita o registo já criado; os restantes
    // ganham registo próprio.
    const registoId =
      indice === 0 ? invoiceId : await createPlaceholder(supabase, input).then((r) => r.id);

    if (!registoId) continue;

    const status = await persistInvoice(supabase, {
      input,
      documento,
      registoId,
      extension,
      preferences,
      raw: extraction.raw,
      // Sem divisão de confiança, ninguém se auto-confirma: um lote mal
      // separado tem de passar por olhos humanos.
      forcarRevisao: multiplas && ranges === null,
      range: ranges?.[indice] ?? null,
      sourceGroupId,
      sourceInvoiceCount: multiplas ? documentos.length : null,
      origem: multiplas ? origem : null,
    });

    criados.push(registoId);
    if (indice === 0) primeiroStatus = status;
  }

  return {
    invoiceIds: criados,
    invoiceId: criados[0] ?? invoiceId,
    status: primeiroStatus,
  };
}

/** Cria o registo mínimo que dá um id ao ficheiro antes de qualquer leitura. */
async function createPlaceholder(
  supabase: SupabaseClient,
  input: IngestInput,
): Promise<{ id: string | null; error?: string }> {
  const { data, error } = await supabase
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

  if (error || !data) {
    return { id: null, error: error?.message ?? "Não foi possível criar o registo da fatura" };
  }

  return { id: data.id };
}

interface PersistOptions {
  input: IngestInput;
  documento: ExtractedInvoice;
  registoId: string;
  extension: string;
  preferences: StatusPreferences;
  raw: unknown;
  forcarRevisao: boolean;
  range: PageRange | null;
  sourceGroupId: string | null;
  sourceInvoiceCount: number | null;
  /** Documento de origem, quando este registo é uma de várias faturas dele. */
  origem: { id: string; path: string } | null;
}

/**
 * Persiste uma fatura extraída: fornecedor, centro de custo, totais, linhas,
 * duplicados e o ficheiro no sítio certo com o nome certo.
 */
async function persistInvoice(
  supabase: SupabaseClient,
  options: PersistOptions,
): Promise<InvoiceStatus> {
  const { input, documento, registoId, preferences } = options;
  const result = documento.result;

  const supplierId = await resolveSupplier(supabase, input.organizationId, result);
  const costCenterId = supplierId
    ? await resolveCostCenter(supabase, input.organizationId, supplierId)
    : null;

  // Totais: manda o resumo impresso no documento; as linhas só entram quando
  // o documento não traz resumo nenhum (ver computeTotals).
  const totals = computeTotals(result);
  const moeda = (result.fatura.moeda || "EUR").toUpperCase();
  const { totalEur, rateUsed } = await convertToEur(
    supabase,
    totals.total,
    moeda,
    result.fatura.data_emissao,
  );

  const status = options.forcarRevisao
    ? "por_rever"
    : decideStatus(documento.confidence, preferences);

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
      confidence_score: documento.confidence,
      extraction_raw: options.raw as never,
      validation_flags: documento.validationFlags as never,
      extraction_error: options.forcarRevisao
        ? "O documento traz várias faturas mas não foi possível delimitá-las com segurança. Cada registo ficou com uma cópia do documento completo — confirme os valores antes de aprovar."
        : null,
      source_group_id: options.sourceGroupId,
      source_pages: options.range ? formatPageRange(options.range) : null,
      source_invoice_count: options.sourceInvoiceCount,
      // Todas as faturas do lote remetem para o documento como ele chegou.
      storage_original_id: options.origem?.id ?? null,
      storage_original_path: options.origem?.path ?? null,
    })
    .eq("id", registoId);

  if (result.linhas.length > 0) {
    await supabase.from("invoice_line_items").insert(
      result.linhas.map((linha, index) => ({
        invoice_id: registoId,
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

  const duplicateOf = await findDuplicate(supabase, {
    organizationId: input.organizationId,
    invoiceId: registoId,
    supplierId,
    numero: result.fatura.numero,
    total: totals.total,
  });

  if (duplicateOf) {
    await supabase
      .from("invoices")
      .update({ is_possible_duplicate: true, duplicate_of_invoice_id: duplicateOf })
      .eq("id", registoId);
  }

  await colocarFicheiro(supabase, options, result);

  return status;
}

/**
 * Dá a esta fatura o seu próprio ficheiro, na pasta definitiva e com o nome
 * definitivo.
 *
 * Quando o documento trazia várias faturas, o ficheiro é a fatia de páginas
 * desta (ou uma cópia do documento inteiro, se os intervalos não mereciam
 * confiança). Quando trazia uma só, reaproveita-se o ficheiro já carregado e
 * apenas se move — é o caminho de sempre, sem uploads extra.
 */
async function colocarFicheiro(
  supabase: SupabaseClient,
  options: PersistOptions,
  result: ExtractionResult,
): Promise<void> {
  const { input, registoId } = options;

  try {
    if (options.origem) {
      const storage = getStorage();
      const buffer = options.range
        ? await extractPages(input.buffer, options.range)
        : input.buffer;

      const guardado = await storage.upload({
        folderPath: buildFolderPath({
          organizationId: input.organizationId,
          pais: input.pais,
          dataEmissao: result.fatura.data_emissao,
        }),
        fileName: buildFileName({
          numero: result.fatura.numero,
          invoiceId: registoId,
          extension: options.extension,
        }),
        buffer,
        mimeType: input.mimeType,
      });

      await supabase
        .from("invoices")
        .update({
          storage_provider: storage.provider,
          storage_container: guardado.container,
          storage_id: guardado.id,
          storage_path: guardado.path,
          file_name: guardado.name,
          file_size: buffer.byteLength,
        })
        .eq("id", registoId);

      return;
    }

    // Fatura única: o ficheiro já está guardado, só falta mudá-lo de _Entrada
    // para a pasta do ano/mês com o número da fatura no nome.
    const { data: guardado } = await supabase
      .from("invoices")
      .select("storage_provider, storage_id")
      .eq("id", registoId)
      .single<Pick<Invoice, "storage_provider" | "storage_id">>();

    const synced = await syncInvoiceFile({
      id: registoId,
      organization_id: input.organizationId,
      storage_provider: guardado?.storage_provider ?? null,
      storage_id: guardado?.storage_id ?? null,
      numero: result.fatura.numero,
      pais: input.pais ?? null,
      data_emissao: result.fatura.data_emissao,
      file_name: input.fileName,
      mime_type: input.mimeType,
      discarded_at: null,
    });

    if (synced) {
      await supabase.from("invoices").update(synced).eq("id", registoId);
    }
  } catch {
    // O ficheiro fica em _Entrada com o id no nome: continua rastreável e será
    // reconciliado na próxima edição. Não vale a pena falhar a ingestão por isto.
  }
}

/**
 * Os totais são os que estão impressos no documento — nunca calculados.
 *
 * Calcular a partir das linhas dá resultados errados sempre que os valores das
 * linhas já incluem IVA, como acontece nas faturas simplificadas portuguesas:
 * num talão de 31,00 com IVA a 13%, somar as linhas dá base 31,00 quando o
 * documento diz base 27,43 e IVA 3,57.
 *
 * A dedução a partir das linhas fica reservada para documentos que não
 * apresentem qualquer resumo de valores.
 */
function computeTotals(result: ExtractionResult) {
  const { base_tributavel, iva_total, total } = result.totais;

  if (total !== null || base_tributavel !== null || iva_total !== null) {
    // Preencher apenas o que faltar, a partir dos outros dois valores lidos.
    const base = base_tributavel ?? (total !== null && iva_total !== null ? total - iva_total : 0);
    const iva = iva_total ?? (total !== null && base_tributavel !== null ? total - base_tributavel : 0);

    return {
      baseTributavel: Number(base.toFixed(2)),
      ivaTotal: Number(iva.toFixed(2)),
      total: Number((total ?? base + iva).toFixed(2)),
    };
  }

  // Sem resumo de valores no documento: resta somar as linhas.
  const linhasBase = result.linhas.reduce((sum, linha) => sum + (linha.total_linha ?? 0), 0);
  const linhasIva = result.linhas.reduce(
    (sum, linha) => sum + ((linha.total_linha ?? 0) * (linha.iva_percentagem ?? 0)) / 100,
    0,
  );

  return {
    baseTributavel: Number(linhasBase.toFixed(2)),
    ivaTotal: Number(linhasIva.toFixed(2)),
    total: Number((linhasBase + linhasIva).toFixed(2)),
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
