/**
 * Verifica a divisão de um PDF em fatias de páginas — a parte que os testes de
 * lógica pura em verify-core.ts não conseguem cobrir, por precisar do pdf-lib.
 *
 * Uso: npx tsx --conditions=react-server scripts/verify-pdf-split.ts
 * (a condição react-server é o que satisfaz o import "server-only")
 */
import { PDFDocument, StandardFonts } from "pdf-lib";

import { extractPages, pageCountOf } from "../lib/invoices/split-pdf";

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.log(`  FALHA ${label}\n        esperado: ${JSON.stringify(expected)}\n        obtido:   ${JSON.stringify(actual)}`);
  }
}

async function main() {
  // Um PDF de 5 páginas identificadas, a imitar um lote de faturas.
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 5; i++) {
    doc.addPage([595, 842]).drawText(`PAGINA ${i}`, { x: 50, y: 780, size: 24, font });
  }
  const origem = Buffer.from(await doc.save());

  console.log("\nContagem de páginas");
  check("PDF de 5 páginas", await pageCountOf(origem, "application/pdf"), 5);
  check("imagem conta como 1", await pageCountOf(Buffer.from("jpeg"), "image/jpeg"), 1);
  check(
    "PDF ilegível devolve null (não se divide)",
    await pageCountOf(Buffer.from("isto nao e um pdf"), "application/pdf"),
    null,
  );

  console.log("\nExtração de intervalos");
  const fatias = await Promise.all([
    extractPages(origem, { inicio: 1, fim: 2 }),
    extractPages(origem, { inicio: 3, fim: 3 }),
    extractPages(origem, { inicio: 4, fim: 5 }),
  ]);

  const contagens = await Promise.all(
    fatias.map((fatia) => pageCountOf(fatia, "application/pdf")),
  );

  check("fatia 1-2 tem 2 páginas", contagens[0], 2);
  check("fatia 3 tem 1 página", contagens[1], 1);
  check("fatia 4-5 tem 2 páginas", contagens[2], 2);
  check(
    "as fatias cobrem o documento inteiro",
    contagens.reduce<number>((sum, n) => sum + (n ?? 0), 0),
    5,
  );

  // Cada fatia tem de ser um PDF autónomo e válido, não um fragmento: é isso
  // que permite abri-la no visualizador e arquivá-la por si só.
  const reaberta = await PDFDocument.load(fatias[1]);
  check("a fatia é um PDF autónomo válido", reaberta.getPageCount(), 1);
  check(
    "e mantém as dimensões da página de origem",
    [Math.round(reaberta.getPage(0).getWidth()), Math.round(reaberta.getPage(0).getHeight())],
    [595, 842],
  );

  console.log(`\n${passed} verificações passaram, ${failed} falharam.\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
