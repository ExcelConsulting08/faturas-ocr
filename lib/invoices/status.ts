import type { ExtractionPreferences, InvoiceStatus } from "@/types/domain";

export type StatusPreferences = Pick<
  ExtractionPreferences,
  "modo" | "limiar_alto" | "limiar_baixo"
>;

/**
 * Traduz a confiança da extração no estado inicial da fatura, segundo as
 * preferências da organização.
 */
export function decideStatus(
  confidence: number,
  preferences: StatusPreferences,
): InvoiceStatus {
  if (preferences.modo === "manual") return "por_rever";

  if (confidence < preferences.limiar_baixo) return "falhada";

  // Semi-automático nunca confirma sozinho: acima do limiar alto continua a
  // passar por revisão humana, apenas com prioridade mais baixa.
  if (preferences.modo === "semi_automatico") return "por_rever";

  return confidence >= preferences.limiar_alto ? "auto_confirmada" : "por_rever";
}
