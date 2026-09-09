export interface PageRange {
  inicio: number;
  fim: number;
}

export interface RangeCandidate {
  pagina_inicio: number | null;
  pagina_fim: number | null;
}

/** Ex.: {inicio: 3, fim: 4} → "3-4"; {inicio: 2, fim: 2} → "2". */
export function formatPageRange(range: PageRange): string {
  return range.inicio === range.fim ? String(range.inicio) : `${range.inicio}-${range.fim}`;
}

/**
 * Valida os intervalos de páginas que o modelo atribuiu a cada fatura.
 *
 * Devolve os intervalos quando são de confiança, ou **null** quando não são —
 * e nesse caso cada registo fica com uma cópia do documento inteiro em vez de
 * uma fatia errada dele. Perder a divisão é um incómodo; cortar uma fatura ao
 * meio ou atribuir-lhe as páginas de outra é um erro que ninguém deteta a
 * olhar para o registo, e que vai parar à contabilidade.
 *
 * Um único documento nunca precisa de divisão: devolve null por definição.
 */
export function validatePageRanges(
  candidates: RangeCandidate[],
  pageCount: number,
): PageRange[] | null {
  if (candidates.length <= 1) return null;
  if (!Number.isInteger(pageCount) || pageCount < 1) return null;

  // Mais faturas do que páginas é impossível: uma fatura ocupa no mínimo uma
  // página. Acontece quando o modelo divide um talão único em vários registos.
  if (candidates.length > pageCount) return null;

  const ranges: PageRange[] = [];

  for (const candidate of candidates) {
    const { pagina_inicio: inicio, pagina_fim: fim } = candidate;

    if (!Number.isInteger(inicio) || !Number.isInteger(fim)) return null;
    if (inicio! < 1 || fim! > pageCount || inicio! > fim!) return null;

    ranges.push({ inicio: inicio!, fim: fim! });
  }

  // Sobreposição significa que o modelo não percebeu onde uma acaba e a outra
  // começa — exatamente o caso em que não se deve dividir nada.
  const ordenados = [...ranges].sort((a, b) => a.inicio - b.inicio);
  for (let i = 1; i < ordenados.length; i++) {
    if (ordenados[i].inicio <= ordenados[i - 1].fim) return null;
  }

  return ranges;
}
