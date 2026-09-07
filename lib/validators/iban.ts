const IBAN_LENGTHS: Record<string, number> = {
  AT: 20, BE: 16, CH: 21, CZ: 24, DE: 22, DK: 18, ES: 24, FI: 18, FR: 27,
  GB: 22, GR: 27, IE: 22, IT: 27, LU: 20, NL: 18, NO: 15, PL: 28, PT: 25,
  SE: 24, SK: 24,
};

export function normalizeIban(iban: string | null | undefined): string | null {
  if (!iban) return null;
  const clean = iban.replace(/\s+/g, "").toUpperCase();
  return clean.length > 0 ? clean : null;
}

/** Valida um IBAN pelo checksum mod-97 (ISO 13616). */
export function isValidIban(iban: string | null | undefined): boolean {
  const clean = normalizeIban(iban);
  if (!clean || !/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(clean)) return false;

  const expectedLength = IBAN_LENGTHS[clean.slice(0, 2)];
  if (expectedLength && clean.length !== expectedLength) return false;
  if (clean.length < 15 || clean.length > 34) return false;

  const rearranged = clean.slice(4) + clean.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (char) => String(char.charCodeAt(0) - 55));

  // mod-97 por blocos: o número inteiro excede Number.MAX_SAFE_INTEGER.
  let remainder = 0;
  for (const digit of numeric) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }

  return remainder === 1;
}
