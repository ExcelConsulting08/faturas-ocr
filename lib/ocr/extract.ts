import "server-only";

import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";

import { EXTRACTION_SYSTEM_PROMPT, buildUserPrompt } from "@/lib/ocr/prompt";
import { extractionSchema, geminiResponseSchema, type ExtractionResult } from "@/lib/ocr/schema";
import { areDatesValid } from "@/lib/validators/dates";
import { isValidIban, normalizeIban } from "@/lib/validators/iban";
import { isValidPortugueseNif, normalizeNif } from "@/lib/validators/nif";
import type { ValidationFlags } from "@/types/domain";

// Versões fixas em vez do alias `-latest`: o alias aponta para o modelo mais
// recente, que anda frequentemente saturado (503) no plano gratuito.
const DEFAULT_MODEL = "gemini-3.6-flash";
/**
 * Modelos de recurso, por ordem. A quota do plano gratuito é diária e contada
 * por modelo, pelo que esgotar um não impede de usar o seguinte.
 */
const DEFAULT_FALLBACKS = ["gemini-3.5-flash", "gemini-flash-latest"];

/** O Gemini devolve 503 quando o modelo está sobrecarregado e 429 no limite de pedidos. */
const RETRYABLE_STATUS = [500, 502, 503, 504];
const MAX_ATTEMPTS = 3;

/** Cadeia de modelos a tentar, do preferido para os de recurso. */
function modelChain(): string[] {
  const primario = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const recursos = process.env.GEMINI_FALLBACK_MODELS
    ? process.env.GEMINI_FALLBACK_MODELS.split(",").map((m) => m.trim()).filter(Boolean)
    : DEFAULT_FALLBACKS;

  // Sem duplicados: se o primário já constar da lista de recurso, não repete.
  return [...new Set([primario, ...recursos])];
}

/** Formatos que a API aceita diretamente. */
const NATIVE_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
/** Formatos que convertemos para PNG antes de enviar. */
const CONVERTIBLE_TYPES = new Set(["image/tiff"]);

/** Uma fatura extraída, já validada e pontuada. */
export interface ExtractedInvoice {
  result: ExtractionResult;
  confidence: number;
  validationFlags: ValidationFlags;
}

export interface ExtractionOutcome {
  /** Uma entrada por fatura encontrada no ficheiro. Vazio quando falhou. */
  invoices: ExtractedInvoice[];
  raw: unknown;
  error: string | null;
  simulated: boolean;
}

export function isExtractionEngineReady(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/** Base das saídas de falha: nenhuma fatura extraída, e não foi simulação. */
const FALHA_VAZIA: Pick<ExtractionOutcome, "invoices" | "simulated"> = {
  invoices: [],
  simulated: false,
};

export async function extractInvoice(options: {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  pais?: string | null;
  idioma?: string | null;
  pageCount?: number | null;
}): Promise<ExtractionOutcome> {
  if (!isExtractionEngineReady()) {
    return simulatedExtraction(options.fileName);
  }

  let usedModel = "";

  try {
    const { data, mimeType } = await prepareDocument(options.buffer, options.mimeType);
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const { response, modelo } = await generateWithFallback(ai, (model) =>
      ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data } },
              { text: buildUserPrompt(options) },
            ],
          },
        ],
        config: {
          systemInstruction: EXTRACTION_SYSTEM_PROMPT,
          responseMimeType: "application/json",
          responseSchema: geminiResponseSchema as never,
          // Extração de dados: queremos a leitura mais literal possível, não criatividade.
          temperature: 0,
        },
      }),
    );

    usedModel = modelo;
    const text = response.text;
    if (!text) {
      return { ...FALHA_VAZIA, raw: response, error: "O modelo não devolveu conteúdo" };
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      return { ...FALHA_VAZIA, raw: text, error: "A resposta do modelo não é JSON válido" };
    }

    const parsed = extractionSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return {
        ...FALHA_VAZIA,
        raw: parsedJson,
        error: `Resposta fora do esquema esperado: ${parsed.error.issues[0]?.message ?? "desconhecido"}`,
      };
    }

    return {
      invoices: parsed.data.documentos.map(pontuar),
      // Guardar o modelo usado permite perceber, mais tarde, se uma leitura
      // duvidosa veio do modelo preferido ou de um de recurso.
      raw: { modelo: usedModel, ...(parsedJson as object) },
      error: null,
      simulated: false,
    };
  } catch (error) {
    return { ...FALHA_VAZIA, raw: null, error: mensagemDeErro(error) };
  }
}

/** Valida uma fatura extraída e converte a confiança do modelo na nossa. */
function pontuar(result: ExtractionResult): ExtractedInvoice {
  const validationFlags = validate(result);
  return {
    result,
    confidence: scoreConfidence(result.confianca, validationFlags),
    validationFlags,
  };
}

/**
 * A API devolve blocos de JSON que não dizem nada a quem usa a aplicação.
 * Traduzimos os casos conhecidos para linguagem acionável.
 */
function mensagemDeErro(error: unknown): string {
  const bruto = error instanceof Error ? error.message : String(error);

  if (/RESOURCE_EXHAUSTED|"code":\s*429|quota/i.test(bruto)) {
    // Só chega aqui depois de todos os modelos da cadeia terem falhado.
    return "Limite diário de pedidos esgotado em todos os modelos configurados. Tente amanhã ou ative a faturação no Google AI Studio.";
  }

  if (/"code":\s*(500|502|503|504)|UNAVAILABLE/i.test(bruto)) {
    return "O serviço de extração está temporariamente sobrecarregado. Tente novamente dentro de alguns minutos.";
  }

  if (/API key|API_KEY_INVALID|PERMISSION_DENIED|401|403/i.test(bruto)) {
    return "A chave de acesso ao Gemini é inválida ou não tem permissões. Verifique a GEMINI_API_KEY.";
  }

  return bruto.length > 300 ? `${bruto.slice(0, 300)}…` : bruto;
}

/**
 * Percorre a cadeia de modelos até um responder.
 *
 * Sobrecarga (503) é transitória: repete no mesmo modelo com espera crescente.
 * Quota esgotada (429) é diária: repetir no mesmo modelo não adianta nada, por
 * isso passa-se imediatamente ao modelo seguinte, que tem quota própria.
 *
 * O utilizador não precisa de saber que isto acontece — é essa a intenção.
 */
async function generateWithFallback<T>(
  _ai: GoogleGenAI,
  operation: (model: string) => Promise<T>,
): Promise<{ response: T; modelo: string }> {
  const modelos = modelChain();
  let ultimoErro: unknown;

  for (const modelo of modelos) {
    if (isQuotaError(ultimoErro)) {
      console.warn(`[ocr] quota esgotada, a passar para o modelo ${modelo}`);
    }

    for (let tentativa = 0; tentativa < MAX_ATTEMPTS; tentativa++) {
      try {
        return { response: await operation(modelo), modelo };
      } catch (error) {
        ultimoErro = error;

        // Quota esgotada ou modelo inexistente: não vale a pena insistir.
        if (isQuotaError(error) || isModelUnavailable(error)) break;

        if (!isRetryable(error) || tentativa === MAX_ATTEMPTS - 1) break;

        // 2s, 4s — dá tempo à capacidade do modelo de libertar.
        await new Promise((resolve) => setTimeout(resolve, 2 ** (tentativa + 1) * 1000));
      }
    }
  }

  throw ultimoErro;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "";
}

/** Limite de pedidos atingido: o modelo não volta a responder hoje. */
function isQuotaError(error: unknown): boolean {
  const texto = errorText(error);
  return /RESOURCE_EXHAUSTED|"code":\s*429/i.test(texto);
}

/** Modelo retirado ou indisponível para esta conta. */
function isModelUnavailable(error: unknown): boolean {
  const texto = errorText(error);
  return /"code":\s*40[034]|NOT_FOUND|no longer available/i.test(texto);
}

function isRetryable(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  if (typeof status === "number") return RETRYABLE_STATUS.includes(status);

  const texto = errorText(error);
  return (
    RETRYABLE_STATUS.some((code) => texto.includes(`"code":${code}`)) ||
    /UNAVAILABLE/i.test(texto)
  );
}

async function prepareDocument(
  buffer: Buffer,
  mimeType: string,
): Promise<{ data: string; mimeType: string }> {
  if (NATIVE_TYPES.has(mimeType)) {
    return { data: buffer.toString("base64"), mimeType };
  }

  if (CONVERTIBLE_TYPES.has(mimeType)) {
    const png = await sharp(buffer).png().toBuffer();
    return { data: png.toString("base64"), mimeType: "image/png" };
  }

  throw new Error(`Tipo de ficheiro não suportado para extração: ${mimeType}`);
}

function validate(result: ExtractionResult): ValidationFlags {
  const nif = normalizeNif(result.fornecedor.nif);
  const iban = normalizeIban(result.fornecedor.iban);

  return {
    // Sem NIF não há nada a validar: marcamos como falso para penalizar a confiança,
    // já que uma fatura sem NIF legível é sempre suspeita.
    nif_valid: nif ? isValidPortugueseNif(nif) : false,
    // IBAN é opcional: ausente conta como válido para não penalizar injustamente.
    iban_valid: iban ? isValidIban(iban) : true,
    dates_valid: areDatesValid(result.fatura.data_emissao, result.fatura.data_vencimento),
    totals_match: totaisCoerentes(result),
    totals_present: result.totais.total !== null && result.totais.base_tributavel !== null,
  };
}

/**
 * Verifica se os três valores lidos batem certo entre si: base + IVA = total.
 *
 * É esta a verificação que apanha leituras erradas dos totais. Sem ela, uma
 * base tributável trocada pelo total passa despercebida e a fatura é
 * auto-confirmada com valores errados.
 */
function totaisCoerentes(result: ExtractionResult): boolean {
  const { base_tributavel, iva_total, total } = result.totais;

  if (base_tributavel === null || iva_total === null || total === null) return false;

  // Tolerância de um cêntimo por arredondamentos, ou 0,5% em valores altos.
  const tolerancia = Math.max(0.02, Math.abs(total) * 0.005);
  return Math.abs(base_tributavel + iva_total - total) <= tolerancia;
}

/**
 * Combina a confiança auto-reportada pelo modelo com os validadores
 * determinísticos: cada verificação falhada aplica uma penalização multiplicativa.
 */
function scoreConfidence(modelConfidence: number, flags: ValidationFlags): number {
  let score = Math.min(Math.max(modelConfidence, 0), 1);

  if (flags.nif_valid === false) score *= 0.75;
  if (flags.iban_valid === false) score *= 0.9;
  if (flags.dates_valid === false) score *= 0.8;

  // Valores são a razão de ser da aplicação: se não fecham ou não foram
  // encontrados no documento, a fatura tem de ir a revisão, por muito confiante
  // que o modelo diga estar. Um erro de leitura aqui vai direto à contabilidade.
  if (flags.totals_present === false) score = Math.min(score, 0.5);
  if (flags.totals_match === false) score = Math.min(score, 0.45);

  return Number(score.toFixed(4));
}

const SIMULATED_CONFIDENCE = 0.72;

/**
 * Modo simulado: permite demonstrar o fluxo completo sem chamadas pagas quando
 * GEMINI_API_KEY não está configurada. Determinístico a partir do nome do
 * ficheiro para que os testes sejam reprodutíveis.
 */
function simulatedExtraction(fileName: string): ExtractionOutcome {
  const seed = [...fileName].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const base = 100 + (seed % 900);
  const iva = Number((base * 0.23).toFixed(2));
  const hoje = new Date();
  const emissao = new Date(hoje.getFullYear(), hoje.getMonth(), 1 + (seed % 27));

  const result: ExtractionResult = {
    pagina_inicio: 1,
    pagina_fim: 1,
    fornecedor: {
      nome: `Fornecedor Simulado ${(seed % 50) + 1}`,
      nif: "500000000",
      iban: null,
    },
    fatura: {
      numero: `SIM-${seed % 10000}`,
      moeda: "EUR",
      data_emissao: emissao.toISOString().slice(0, 10),
      data_vencimento: new Date(emissao.getTime() + 30 * 86400000).toISOString().slice(0, 10),
      is_credit_note: false,
    },
    linhas: [
      {
        descricao: "Linha simulada (motor de extração desligado)",
        quantidade: 1,
        preco_unitario: base,
        iva_percentagem: 23,
        desconto: 0,
        outro_imposto: 0,
        total_linha: base,
      },
    ],
    linhas_incluem_iva: false,
    totais: { base_tributavel: base, iva_total: iva, total: Number((base + iva).toFixed(2)) },
    // Entre os limiares por omissão (0.6 e 0.9): dados fictícios têm de passar
    // por revisão humana, mas não devem aparecer como falha de leitura.
    confianca: SIMULATED_CONFIDENCE,
  };

  return {
    invoices: [{ result, confidence: SIMULATED_CONFIDENCE, validationFlags: validate(result) }],
    raw: { simulado: true },
    error: null,
    simulated: true,
  };
}
