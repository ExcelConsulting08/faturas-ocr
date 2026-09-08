import { z } from "zod";

export const lineItemSchema = z.object({
  descricao: z.string().nullable(),
  quantidade: z.number().nullable(),
  preco_unitario: z.number().nullable(),
  iva_percentagem: z.number().nullable(),
  desconto: z.number().nullable(),
  outro_imposto: z.number().nullable(),
  total_linha: z.number().nullable(),
});

export const extractionSchema = z.object({
  fornecedor: z.object({
    nome: z.string().nullable(),
    nif: z.string().nullable(),
    iban: z.string().nullable(),
  }),
  fatura: z.object({
    numero: z.string().nullable(),
    moeda: z.string().nullable(),
    data_emissao: z.string().nullable(),
    data_vencimento: z.string().nullable(),
    is_credit_note: z.boolean().nullable(),
  }),
  linhas: z.array(lineItemSchema),
  linhas_incluem_iva: z.boolean().nullable(),
  totais: z.object({
    base_tributavel: z.number().nullable(),
    iva_total: z.number().nullable(),
    total: z.number().nullable(),
  }),
  confianca: z.number().min(0).max(1),
});

export type ExtractionResult = z.infer<typeof extractionSchema>;
export type ExtractedLineItem = z.infer<typeof lineItemSchema>;

/**
 * Esquema equivalente para o `responseSchema` do Gemini.
 * O Gemini exige `nullable: true` em vez de tipos união, e respeita a ordem
 * declarada em `propertyOrdering`.
 */
export const geminiResponseSchema = {
  type: "object",
  properties: {
    fornecedor: {
      type: "object",
      properties: {
        nome: { type: "string", nullable: true, description: "Nome legal de quem emitiu a fatura" },
        nif: { type: "string", nullable: true, description: "NIF do fornecedor, apenas dígitos" },
        iban: { type: "string", nullable: true, description: "IBAN do fornecedor, se presente" },
      },
      required: ["nome", "nif", "iban"],
      propertyOrdering: ["nome", "nif", "iban"],
    },
    fatura: {
      type: "object",
      properties: {
        numero: { type: "string", nullable: true, description: "Número do documento" },
        moeda: { type: "string", nullable: true, description: "Código ISO 4217, ex. EUR" },
        data_emissao: { type: "string", nullable: true, description: "AAAA-MM-DD" },
        data_vencimento: { type: "string", nullable: true, description: "AAAA-MM-DD" },
        is_credit_note: { type: "boolean", nullable: true, description: "true se nota de crédito" },
      },
      required: ["numero", "moeda", "data_emissao", "data_vencimento", "is_credit_note"],
      propertyOrdering: ["numero", "moeda", "data_emissao", "data_vencimento", "is_credit_note"],
    },
    linhas: {
      type: "array",
      description: "Linhas de artigos ou serviços",
      items: {
        type: "object",
        properties: {
          descricao: { type: "string", nullable: true },
          quantidade: { type: "number", nullable: true },
          preco_unitario: { type: "number", nullable: true },
          iva_percentagem: { type: "number", nullable: true, description: "Taxa em percentagem, ex. 23" },
          desconto: { type: "number", nullable: true },
          outro_imposto: { type: "number", nullable: true },
          total_linha: { type: "number", nullable: true, description: "Total da linha sem IVA" },
        },
        required: [
          "descricao",
          "quantidade",
          "preco_unitario",
          "iva_percentagem",
          "desconto",
          "outro_imposto",
          "total_linha",
        ],
        propertyOrdering: [
          "descricao",
          "quantidade",
          "preco_unitario",
          "iva_percentagem",
          "desconto",
          "outro_imposto",
          "total_linha",
        ],
      },
    },
    linhas_incluem_iva: {
      type: "boolean",
      nullable: true,
      description: "true se os valores das linhas já incluem IVA (comum em talões)",
    },
    totais: {
      type: "object",
      properties: {
        base_tributavel: {
          type: "number",
          nullable: true,
          description: "Valor sem IVA, tal como impresso no documento. Nunca calculado.",
        },
        iva_total: {
          type: "number",
          nullable: true,
          description: "Montante de IVA em euros, tal como impresso. Nunca calculado.",
        },
        total: {
          type: "number",
          nullable: true,
          description: "Total a pagar, tal como impresso no documento.",
        },
      },
      required: ["base_tributavel", "iva_total", "total"],
      propertyOrdering: ["base_tributavel", "iva_total", "total"],
    },
    confianca: {
      type: "number",
      description: "Confiança global na extração, entre 0 e 1",
    },
  },
  required: ["fornecedor", "fatura", "linhas", "linhas_incluem_iva", "totais", "confianca"],
  propertyOrdering: [
    "fornecedor",
    "fatura",
    "linhas",
    "linhas_incluem_iva",
    "totais",
    "confianca",
  ],
};
