import "server-only";

import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";

import { EXTRACTION_SYSTEM_PROMPT, buildUserPrompt } from "@/lib/ocr/prompt";
import { extractionSchema, geminiResponseSchema, type ExtractionResult } from "@/lib/ocr/schema";
import { areDatesValid } from "@/lib/validators/dates";
import { isValidIban, normalizeIban } from "@/lib/validators/iban";
import { isValidPortugueseNif, normalizeNif } from "@/lib/validators/nif";
import type { ValidationFlags } from "@/types/domain";

// Versão fixa em vez do alias `-latest`: o alias aponta para o modelo mais
// recente, que anda frequentemente saturado (503) no plano gratuito.
const DEFAULT_MODEL = "gemini-3.6-flash";

/** O Gemini devolve 503 quando o modelo está sobrecarregado e 429 no limite de pedidos. */
const RETRYABLE_STATUS = [429, 500, 502, 503, 504];
const MAX_ATTEMPTS = 4;

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

export interface ExtractionOutcome {
  result: ExtractionResult | null;
  confidence: number;
  validationFlags: ValidationFlags;
  raw: unknown;
  error: string | null;
  simulated: boolean;
}

export function isExtractionEngineReady(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function extractInvoice(options: {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  pais?: string | null;
  idioma?: string | null;
}): Promise<ExtractionOutcome> {
  if (!isExtractionEngineReady()) {
    return simulatedExtraction(options.fileName);
  }

  try {
    const { data, mimeType } = await prepareDocument(options.buffer, options.mimeType);
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const response = await withRetry(() =>
      ai.models.generateContent({
        model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
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

    const text = response.text;
    if (!text) {
      return {
        result: null,
        confidence: 0,
        validationFlags: {},
        raw: response,
        error: "O modelo não devolveu conteúdo",
        simulated: false,
      };
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      return {
        result: null,
        confidence: 0,
        validationFlags: {},
        raw: text,
        error: "A resposta do modelo não é JSON válido",
        simulated: false,
      };
    }

    const parsed = extractionSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return {
        result: null,
        confidence: 0,
        validationFlags: {},
        raw: parsedJson,
        error: `Resposta fora do esquema esperado: ${parsed.error.issues[0]?.message ?? "desconhecido"}`,
        simulated: false,
      };
    }

    const validationFlags = validate(parsed.data);

    return {
      result: parsed.data,
      confidence: scoreConfidence(parsed.data.confianca, validationFlags),
      validationFlags,
      raw: parsedJson,
      error: null,
      simulated: false,
    };
  } catch (error) {
    return {
      result: null,
      confidence: 0,
      validationFlags: {},
      raw: null,
      error: error instanceof Error ? error.message : "Erro desconhecido na extração",
      simulated: false,
    };
  }
}

/**
 * Sobrecarga do modelo (503) e limites de pedidos (429) são transitórios: sem
 * repetição, uma fatura perfeitamente legível ficaria marcada como falhada.
 */
async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === MAX_ATTEMPTS - 1) throw error;

      // 2s, 4s, 8s — dá tempo à capacidade do modelo de libertar.
      await new Promise((resolve) => setTimeout(resolve, 2 ** (attempt + 1) * 1000));
    }
  }

  throw lastError;
}

function isRetryable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const status = (error as { status?: number }).status;
  if (typeof status === "number") return RETRYABLE_STATUS.includes(status);

  // O SDK nem sempre expõe o status: a mensagem traz o JSON do erro.
  return RETRYABLE_STATUS.some((code) => error.message.includes(`"code":${code}`))
    || error.message.includes("UNAVAILABLE")
    || error.message.includes("RESOURCE_EXHAUSTED");
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

  const linhasTotal = result.linhas.reduce((sum, linha) => sum + (linha.total_linha ?? 0), 0);
  const baseTributavel = result.totais.base_tributavel;

  return {
    // Sem NIF não há nada a validar: marcamos como falso para penalizar a confiança,
    // já que uma fatura sem NIF legível é sempre suspeita.
    nif_valid: nif ? isValidPortugueseNif(nif) : false,
    // IBAN é opcional: ausente conta como válido para não penalizar injustamente.
    iban_valid: iban ? isValidIban(iban) : true,
    dates_valid: areDatesValid(result.fatura.data_emissao, result.fatura.data_vencimento),
    totals_match:
      baseTributavel === null || linhasTotal === 0
        ? true
        : Math.abs(linhasTotal - baseTributavel) <= Math.max(0.02, baseTributavel * 0.01),
  };
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
  if (flags.totals_match === false) score *= 0.7;

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
    totais: { base_tributavel: base, iva_total: iva, total: Number((base + iva).toFixed(2)) },
    // Entre os limiares por omissão (0.6 e 0.9): dados fictícios têm de passar
    // por revisão humana, mas não devem aparecer como falha de leitura.
    confianca: SIMULATED_CONFIDENCE,
  };

  return {
    result,
    confidence: SIMULATED_CONFIDENCE,
    validationFlags: validate(result),
    raw: { simulado: true },
    error: null,
    simulated: true,
  };
}
