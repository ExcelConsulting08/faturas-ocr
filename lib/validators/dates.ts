const MAX_YEARS_AWAY = 5;

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Datas plausíveis para uma fatura: emissão não depois do vencimento e ambas
 * dentro de uma janela razoável face a hoje (apanha anos mal lidos pelo OCR).
 */
export function areDatesValid(
  dataEmissao: string | null | undefined,
  dataVencimento: string | null | undefined,
): boolean {
  const emissao = parseDate(dataEmissao);
  const vencimento = parseDate(dataVencimento);

  if (!emissao) return false;

  const now = new Date();
  const minDate = new Date(now.getFullYear() - MAX_YEARS_AWAY, 0, 1);
  const maxDate = new Date(now.getFullYear() + MAX_YEARS_AWAY, 11, 31);

  if (emissao < minDate || emissao > maxDate) return false;

  if (vencimento) {
    if (vencimento < minDate || vencimento > maxDate) return false;
    if (vencimento < emissao) return false;
  }

  return true;
}
