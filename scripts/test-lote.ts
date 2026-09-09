/**
 * Testa a separação de várias faturas num só ficheiro, contra o modelo real.
 *
 * Gera um PDF fictício com duas faturas de fornecedores diferentes (a primeira
 * com duas páginas, para o modelo ter de distinguir "continuação" de "nova
 * fatura") e compara o que o modelo devolve com o que lá está.
 *
 * Uso: npx tsx --conditions=react-server --env-file=.env.local scripts/test-lote.ts
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { extractInvoice } from "../lib/ocr/extract";
import { validatePageRanges } from "../lib/invoices/page-ranges";
import { pageCountOf } from "../lib/invoices/split-pdf";

const FATURA_A = {
  fornecedor: "Papelaria Ficticia Unipessoal, Lda.",
  nif: "501442600",
  numero: "FT 2026A/00147",
  emissao: "2026-09-03",
  base: 1185.5,
  iva: 272.67,
  total: 1458.17,
  paginas: "1-2",
};

const FATURA_B = {
  fornecedor: "Transportes Imaginarios, S.A.",
  nif: "500084580",
  numero: "FA 2026/8821",
  emissao: "2026-09-05",
  base: 340.0,
  iva: 78.2,
  total: 418.2,
  paginas: "3",
};

function money(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

async function construirLote(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const escrever = (linhas: [string, boolean][]) => {
    const page = doc.addPage([595, 842]);
    let y = 780;
    for (const [texto, destaque] of linhas) {
      page.drawText(texto, {
        x: 50,
        y,
        size: destaque ? 14 : 10,
        font: destaque ? bold : font,
        color: rgb(0, 0, 0),
      });
      y -= destaque ? 26 : 16;
    }
  };

  // Fatura A, pagina 1 de 2
  escrever([
    ["FATURA", true],
    [`Fornecedor: ${FATURA_A.fornecedor}`, false],
    [`NIF: ${FATURA_A.nif}`, false],
    ["Rua Inventada 123, 1000-001 Lisboa", false],
    [`Numero: ${FATURA_A.numero}`, false],
    [`Data de emissao: ${FATURA_A.emissao}`, false],
    ["Moeda: EUR", false],
    ["", false],
    ["Cliente: Excel Consulting, Lda.   NIF: 513317171", false],
    ["", false],
    ["DESCRICAO                          QTD    PRECO      TOTAL", false],
    ["Consultoria - Setembro               5    220,00   1.100,00", false],
    ["Deslocacoes                          1     85,50      85,50", false],
    ["", false],
    ["Pag. 1 de 2 - continua", false],
  ]);

  // Fatura A, pagina 2 de 2 (continuacao: mesmo numero, so os totais)
  escrever([
    [`${FATURA_A.numero} (continuacao)`, true],
    ["Pag. 2 de 2", false],
    ["", false],
    ["RESUMO", false],
    [`Base tributavel: ${money(FATURA_A.base)} EUR`, false],
    [`IVA (23%): ${money(FATURA_A.iva)} EUR`, false],
    [`TOTAL A PAGAR: ${money(FATURA_A.total)} EUR`, false],
  ]);

  // Fatura B, uma unica pagina: novo cabecalho, novo numero, nova data
  escrever([
    ["FATURA", true],
    [`Fornecedor: ${FATURA_B.fornecedor}`, false],
    [`NIF: ${FATURA_B.nif}`, false],
    ["Avenida Imaginaria 45, 4000-002 Porto", false],
    [`Numero: ${FATURA_B.numero}`, false],
    [`Data de emissao: ${FATURA_B.emissao}`, false],
    ["Moeda: EUR", false],
    ["", false],
    ["Cliente: Excel Consulting, Lda.   NIF: 513317171", false],
    ["", false],
    ["DESCRICAO                          QTD    PRECO      TOTAL", false],
    ["Transporte de mercadorias            2    170,00     340,00", false],
    ["", false],
    [`Base tributavel: ${money(FATURA_B.base)} EUR`, false],
    [`IVA (23%): ${money(FATURA_B.iva)} EUR`, false],
    [`TOTAL A PAGAR: ${money(FATURA_B.total)} EUR`, false],
  ]);

  return Buffer.from(await doc.save());
}

function comparar(label: string, obtido: unknown, esperado: unknown): boolean {
  const ok = String(obtido) === String(esperado);
  console.log(`     ${ok ? "ok  " : "ERRO"} ${label}: ${obtido}${ok ? "" : `  (esperado ${esperado})`}`);
  return ok;
}

async function main() {
  const pdf = await construirLote();
  const paginas = await pageCountOf(pdf, "application/pdf");
  console.log(`\nLote gerado: ${pdf.byteLength} bytes, ${paginas} páginas`);
  console.log("Contém 2 faturas: a primeira ocupa as páginas 1-2, a segunda a página 3.\n");

  if (!process.env.GEMINI_API_KEY) {
    console.log("GEMINI_API_KEY em falta — sem chave este teste não diz nada.");
    process.exit(1);
  }

  const inicio = Date.now();
  const resultado = await extractInvoice({
    buffer: pdf,
    mimeType: "application/pdf",
    fileName: "lote-duas-faturas.pdf",
    pais: "PT",
    idioma: "pt",
    pageCount: paginas,
  });
  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);

  if (resultado.error) {
    console.log(`FALHOU em ${segundos}s: ${resultado.error}`);
    process.exit(1);
  }

  console.log(`Extração em ${segundos}s → ${resultado.invoices.length} fatura(s) encontradas`);

  let acertos = 0;
  let testes = 0;
  const conta = (ok: boolean) => {
    testes++;
    if (ok) acertos++;
  };

  conta(comparar("número de faturas", resultado.invoices.length, 2));

  const ranges = validatePageRanges(
    resultado.invoices.map((d) => ({
      pagina_inicio: d.result.pagina_inicio,
      pagina_fim: d.result.pagina_fim,
    })),
    paginas ?? 0,
  );

  console.log(`\n  Intervalos de páginas: ${ranges ? JSON.stringify(ranges) : "REJEITADOS (cada registo levaria uma cópia do documento inteiro)"}`);
  conta(comparar("intervalos aceites", ranges !== null, true));

  for (const [i, esperada] of [FATURA_A, FATURA_B].entries()) {
    const obtida = resultado.invoices[i];
    console.log(`\n  Fatura ${i + 1} (esperada: ${esperada.numero})`);

    if (!obtida) {
      console.log("     ERRO não foi devolvida");
      testes += 6;
      continue;
    }

    const r = obtida.result;
    conta(comparar("fornecedor", r.fornecedor.nome, esperada.fornecedor));
    conta(comparar("NIF", r.fornecedor.nif, esperada.nif));
    conta(comparar("número", r.fatura.numero, esperada.numero));
    conta(comparar("data emissão", r.fatura.data_emissao, esperada.emissao));
    conta(comparar("base tributável", r.totais.base_tributavel, esperada.base));
    conta(comparar("total", r.totais.total, esperada.total));
    console.log(`     ---- páginas ${r.pagina_inicio}-${r.pagina_fim} (esperado ${esperada.paginas}), confiança ${Math.round(obtida.confidence * 100)}%`);
  }

  // Regressão: o risco desta funcionalidade é passar a dividir o que não deve.
  // Uma fatura única, de uma página, tem de continuar a dar exatamente um
  // registo — é o caso de longe mais comum.
  console.log("\n  Regressão: fatura única não pode ser dividida");
  const unica = await construirFaturaUnica();
  const resultadoUnico = await extractInvoice({
    buffer: unica,
    mimeType: "application/pdf",
    fileName: "fatura-unica.pdf",
    pais: "PT",
    idioma: "pt",
    pageCount: await pageCountOf(unica, "application/pdf"),
  });

  if (resultadoUnico.error) {
    console.log(`     ERRO ${resultadoUnico.error}`);
    testes++;
  } else {
    conta(comparar("faturas encontradas", resultadoUnico.invoices.length, 1));
    conta(
      comparar("número", resultadoUnico.invoices[0]?.result.fatura.numero, FATURA_B.numero),
    );
  }

  console.log(`\n${acertos}/${testes} corretos.\n`);
  process.exit(acertos === testes ? 0 : 1);
}

/** A fatura B sozinha, numa página — o caso normal. */
async function construirFaturaUnica(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 842]);

  const linhas: [string, boolean][] = [
    ["FATURA", true],
    [`Fornecedor: ${FATURA_B.fornecedor}`, false],
    [`NIF: ${FATURA_B.nif}`, false],
    [`Numero: ${FATURA_B.numero}`, false],
    [`Data de emissao: ${FATURA_B.emissao}`, false],
    ["", false],
    ["Transporte de mercadorias            2    170,00     340,00", false],
    ["", false],
    [`Base tributavel: ${money(FATURA_B.base)} EUR`, false],
    [`IVA (23%): ${money(FATURA_B.iva)} EUR`, false],
    [`TOTAL A PAGAR: ${money(FATURA_B.total)} EUR`, false],
  ];

  let y = 780;
  for (const [texto, destaque] of linhas) {
    page.drawText(texto, { x: 50, y, size: destaque ? 14 : 10, font: destaque ? bold : font });
    y -= destaque ? 26 : 16;
  }

  return Buffer.from(await doc.save());
}

main();
