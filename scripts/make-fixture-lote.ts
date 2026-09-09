/**
 * Gera um PDF fictício com DUAS faturas, para testar a separação em registos.
 * A primeira ocupa duas páginas — é a armadilha: a continuação não pode virar
 * uma terceira fatura.
 *
 * Dados totalmente inventados. Nunca usar documentos reais de clientes.
 *
 * Uso: npx tsx scripts/make-fixture-lote.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";

const FATURA_A = {
  fornecedor: "Papelaria Ficticia Unipessoal, Lda.",
  nif: "501442600",
  numero: "FT 2026A/00147",
  emissao: "2026-09-03",
  base: 1185.5,
  iva: 272.67,
  total: 1458.17,
};

const FATURA_B = {
  fornecedor: "Transportes Imaginarios, S.A.",
  nif: "500084580",
  numero: "FA 2026/8821",
  emissao: "2026-09-05",
  base: 340.0,
  iva: 78.2,
  total: 418.2,
};

const money = (value: number) => value.toFixed(2).replace(".", ",");

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pagina = (linhas: [string, boolean][]) => {
    const page = doc.addPage([595, 842]);
    let y = 780;
    for (const [texto, destaque] of linhas) {
      page.drawText(texto, { x: 50, y, size: destaque ? 14 : 10, font: destaque ? bold : font });
      y -= destaque ? 26 : 16;
    }
  };

  pagina([
    ["FATURA", true],
    [`Fornecedor: ${FATURA_A.fornecedor}`, false],
    [`NIF: ${FATURA_A.nif}`, false],
    ["Rua Inventada 123, 1000-001 Lisboa", false],
    [`Numero: ${FATURA_A.numero}`, false],
    [`Data de emissao: ${FATURA_A.emissao}`, false],
    ["Moeda: EUR", false],
    ["", false],
    ["Cliente: Empresa de Teste, Lda.   NIF: 513317171", false],
    ["", false],
    ["DESCRICAO                          QTD    PRECO      TOTAL", false],
    ["Consultoria - Setembro               5    220,00   1.100,00", false],
    ["Deslocacoes                          1     85,50      85,50", false],
    ["", false],
    ["Pag. 1 de 2 - continua", false],
  ]);

  pagina([
    [`${FATURA_A.numero} (continuacao)`, true],
    ["Pag. 2 de 2", false],
    ["", false],
    ["RESUMO", false],
    [`Base tributavel: ${money(FATURA_A.base)} EUR`, false],
    [`IVA (23%): ${money(FATURA_A.iva)} EUR`, false],
    [`TOTAL A PAGAR: ${money(FATURA_A.total)} EUR`, false],
  ]);

  pagina([
    ["FATURA", true],
    [`Fornecedor: ${FATURA_B.fornecedor}`, false],
    [`NIF: ${FATURA_B.nif}`, false],
    ["Avenida Imaginaria 45, 4000-002 Porto", false],
    [`Numero: ${FATURA_B.numero}`, false],
    [`Data de emissao: ${FATURA_B.emissao}`, false],
    ["Moeda: EUR", false],
    ["", false],
    ["Cliente: Empresa de Teste, Lda.   NIF: 513317171", false],
    ["", false],
    ["DESCRICAO                          QTD    PRECO      TOTAL", false],
    ["Transporte de mercadorias            2    170,00     340,00", false],
    ["", false],
    [`Base tributavel: ${money(FATURA_B.base)} EUR`, false],
    [`IVA (23%): ${money(FATURA_B.iva)} EUR`, false],
    [`TOTAL A PAGAR: ${money(FATURA_B.total)} EUR`, false],
  ]);

  const dir = join(process.cwd(), "scripts", "fixtures");
  mkdirSync(dir, { recursive: true });
  const caminho = join(dir, "lote-duas-faturas.pdf");
  writeFileSync(caminho, Buffer.from(await doc.save()));

  console.log(`Lote de teste criado em ${caminho}`);
  console.log("\n3 páginas, 2 faturas:");
  console.log(`  páginas 1-2: ${FATURA_A.numero} — ${FATURA_A.fornecedor} — ${money(FATURA_A.total)} EUR`);
  console.log(`  página    3: ${FATURA_B.numero} — ${FATURA_B.fornecedor} — ${money(FATURA_B.total)} EUR`);
}

main();
