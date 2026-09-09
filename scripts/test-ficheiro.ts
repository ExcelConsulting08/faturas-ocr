/**
 * Corre a extração contra um ficheiro à escolha e mostra o que o modelo devolveu.
 *
 * Existe para diagnosticar casos reais sem passar pela aplicação: o que
 * interessa aqui é ver o JSON cru, porque a diferença entre "o modelo leu mal"
 * e "o pipeline estragou depois" só se vê antes de qualquer tratamento.
 *
 * Não escreve nada em disco nem na base de dados — o ficheiro apontado pode ser
 * um documento real de fornecedor e não deve entrar no repositório.
 *
 * Uso:
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/test-ficheiro.ts <caminho> [pais]
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { extractInvoice } from "../lib/ocr/extract";
import { validatePageRanges } from "../lib/invoices/page-ranges";
import { pageCountOf } from "../lib/invoices/split-pdf";

const MIME_POR_EXTENSAO: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
};

async function main() {
  const caminho = process.argv[2];
  const pais = process.argv[3] ?? "PT";

  if (!caminho) {
    console.log("Falta o caminho do ficheiro.");
    console.log(
      "Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/test-ficheiro.ts <caminho> [pais]",
    );
    process.exit(1);
  }

  if (!process.env.GEMINI_API_KEY) {
    console.log("GEMINI_API_KEY em falta — sem chave a extração é simulada e o teste não diz nada.");
    process.exit(1);
  }

  const buffer = readFileSync(caminho);
  const nome = basename(caminho);
  const extensao = nome.split(".").pop()?.toLowerCase() ?? "";
  const mimeType = MIME_POR_EXTENSAO[extensao];

  if (!mimeType) {
    console.log(`Extensão ".${extensao}" não reconhecida.`);
    process.exit(1);
  }

  const paginas = await pageCountOf(buffer, mimeType);
  console.log(`\n${nome} — ${buffer.byteLength} bytes, ${paginas ?? "?"} página(s), país ${pais}`);

  const inicio = Date.now();
  const resultado = await extractInvoice({
    buffer,
    mimeType,
    fileName: nome,
    pais,
    idioma: pais === "PT" ? "pt" : null,
    pageCount: paginas,
  });
  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);

  if (resultado.error) {
    console.log(`\nFALHOU em ${segundos}s: ${resultado.error}`);
    process.exit(1);
  }

  // Qual modelo respondeu importa: a cadeia de recurso troca de modelo em
  // silêncio quando a quota esgota, e modelos diferentes lêem diferente.
  const modelo = (resultado.raw as { modelo?: string } | null)?.modelo ?? "?";
  console.log(`Extração em ${segundos}s por ${modelo} → ${resultado.invoices.length} fatura(s)\n`);

  for (const [i, fatura] of resultado.invoices.entries()) {
    const r = fatura.result;
    console.log(`  Fatura ${i + 1} de ${resultado.invoices.length}`);
    // Entre aspas de propósito: é assim que se vê um prefixo ou espaço a mais
    // que de outra forma passa despercebido na consola.
    console.log(`     numero          "${r.fatura.numero}"`);
    console.log(`     fornecedor      "${r.fornecedor.nome}"  NIF ${r.fornecedor.nif}`);
    console.log(`     emissão         ${r.fatura.data_emissao}   moeda ${r.fatura.moeda}`);
    console.log(
      `     totais          base ${r.totais.base_tributavel} · IVA ${r.totais.iva_total} · total ${r.totais.total}`,
    );
    console.log(
      `     páginas         ${r.pagina_inicio}-${r.pagina_fim}   linhas ${r.linhas.length}   confiança ${Math.round(fatura.confidence * 100)}%`,
    );
    const alertas = Object.entries(fatura.validationFlags)
      .filter(([, valor]) => valor === true)
      .map(([chave]) => chave);
    if (alertas.length > 0) console.log(`     alertas         ${alertas.join(", ")}`);
    console.log();
  }

  const ranges = validatePageRanges(
    resultado.invoices.map((d) => ({
      pagina_inicio: d.result.pagina_inicio,
      pagina_fim: d.result.pagina_fim,
    })),
    paginas ?? 0,
  );
  console.log(
    `  Intervalos de páginas: ${ranges ? JSON.stringify(ranges) : "REJEITADOS (cada registo levaria uma cópia do documento inteiro)"}`,
  );

  if (process.argv.includes("--raw")) {
    console.log("\n  JSON cru devolvido pelo modelo:\n");
    console.log(JSON.stringify(resultado.raw, null, 2));
  }
}

main();
