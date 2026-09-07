/** Prefixos válidos de NIF português (1/2 singulares, 5 coletivos, 6 públicos, etc.). */
const VALID_PREFIXES = ["1", "2", "3", "5", "6", "8", "45", "70", "71", "72", "74", "75", "77", "78", "79", "90", "91", "98", "99"];

export function normalizeNif(nif: string | null | undefined): string | null {
  if (!nif) return null;
  const digits = nif.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

/**
 * Valida um NIF português pelo dígito de controlo (módulo 11).
 * NIFs estrangeiros não passam nesta validação — por isso o resultado é apenas
 * um sinal de confiança, nunca um bloqueio à gravação.
 */
export function isValidPortugueseNif(nif: string | null | undefined): boolean {
  const digits = normalizeNif(nif);
  if (!digits || digits.length !== 9) return false;

  const hasValidPrefix = VALID_PREFIXES.some((prefix) => digits.startsWith(prefix));
  if (!hasValidPrefix) return false;

  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += Number(digits[i]) * (9 - i);
  }

  const remainder = sum % 11;
  const checkDigit = remainder < 2 ? 0 : 11 - remainder;

  return checkDigit === Number(digits[8]);
}
