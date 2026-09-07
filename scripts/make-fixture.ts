/**
 * Gera uma fatura fictícia em PDF para testar o pipeline de ingestão.
 * Dados totalmente inventados — nunca usar documentos reais de clientes.
 *
 * Uso: npx tsx scripts/make-fixture.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LINHAS = [
  { descricao: "Servicos de consultoria - Setembro", qtd: 5, preco: 220.0 },
  { descricao: "Deslocacoes", qtd: 1, preco: 85.5 },
];

const base = LINHAS.reduce((sum, l) => sum + l.qtd * l.preco, 0);
const iva = base * 0.23;
const total = base + iva;

function money(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

const linhasPdf = LINHAS.map(
  (l) =>
    `(${l.descricao}) Tj 0 -16 Td (Qtd: ${l.qtd}   Preco unit: ${money(l.preco)} EUR   ` +
    `IVA: 23%   Total: ${money(l.qtd * l.preco)} EUR) Tj 0 -22 Td`,
).join("\n");

const conteudo = `BT
/F1 16 Tf
50 780 Td
(FATURA) Tj
/F1 10 Tf
0 -30 Td
(Fornecedor: Papelaria Ficticia Unipessoal, Lda.) Tj
0 -14 Td
(NIF: 501442600) Tj
0 -14 Td
(IBAN: PT50000201231234567890154) Tj
0 -14 Td
(Rua Inventada 123, 1000-001 Lisboa) Tj
0 -28 Td
(Numero: FT 2026A/00147) Tj
0 -14 Td
(Data de emissao: 2026-09-03) Tj
0 -14 Td
(Data de vencimento: 2026-10-03) Tj
0 -14 Td
(Moeda: EUR) Tj
0 -28 Td
(Cliente: Excel Consulting, Lda.   NIF: 500084580) Tj
0 -28 Td
(DESCRICAO) Tj
0 -22 Td
${linhasPdf}
0 -10 Td
(Base tributavel: ${money(base)} EUR) Tj
0 -14 Td
(IVA (23%): ${money(iva)} EUR) Tj
0 -14 Td
(TOTAL A PAGAR: ${money(total)} EUR) Tj
ET`;

const objetos = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
  `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
];

let pdf = "%PDF-1.4\n";
const offsets: number[] = [];

objetos.forEach((obj, index) => {
  offsets.push(pdf.length);
  pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
});

const xrefStart = pdf.length;
pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
for (const offset of offsets) {
  pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

const dir = join(process.cwd(), "scripts", "fixtures");
mkdirSync(dir, { recursive: true });
const caminho = join(dir, "fatura-exemplo.pdf");
writeFileSync(caminho, pdf, "latin1");

console.log(`Fatura de teste criada em ${caminho}`);
console.log(`Valores esperados: base ${money(base)}, IVA ${money(iva)}, total ${money(total)} EUR`);
console.log("Fornecedor: Papelaria Ficticia Unipessoal, Lda. (NIF 501442600)");
console.log("Numero: FT 2026A/00147");
