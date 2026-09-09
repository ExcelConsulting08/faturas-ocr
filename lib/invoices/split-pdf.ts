import "server-only";

import { PDFDocument } from "pdf-lib";

import type { PageRange } from "@/lib/invoices/page-ranges";

/**
 * Número de páginas de um PDF. Devolve 1 para imagens, e null quando o
 * ficheiro não é legível como PDF (cifrado, corrompido) — nesse caso não se
 * divide nada e o documento segue inteiro.
 */
export async function pageCountOf(buffer: Buffer, mimeType: string): Promise<number | null> {
  if (mimeType !== "application/pdf") return 1;

  try {
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
    return pdf.getPageCount();
  } catch {
    return null;
  }
}

/**
 * Extrai um intervalo de páginas para um PDF novo e autónomo.
 *
 * É isto que dá a cada fatura o seu próprio ficheiro, e com ele tudo o que a
 * aplicação já sabe fazer a um ficheiro: renomear quando o número muda, mudar
 * de pasta quando a data muda, arquivar quando é descartada.
 */
export async function extractPages(buffer: Buffer, range: PageRange): Promise<Buffer> {
  const origem = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const destino = await PDFDocument.create();

  // pdf-lib indexa a partir de 0; os intervalos do modelo a partir de 1.
  const indices = [];
  for (let pagina = range.inicio; pagina <= range.fim; pagina++) {
    indices.push(pagina - 1);
  }

  const paginas = await destino.copyPages(origem, indices);
  for (const pagina of paginas) destino.addPage(pagina);

  return Buffer.from(await destino.save());
}
