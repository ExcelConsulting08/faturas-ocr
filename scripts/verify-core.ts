/**
 * Verificação da lógica pura, sem dependências externas.
 * Correr com: npx tsx scripts/verify-core.ts
 */
import { decideStatus } from "../lib/invoices/status";
import { buildFileName, buildFolderPath, sanitizeNumero } from "../lib/sharepoint/paths";
import { normalizeNumero } from "../lib/duplicates/detect";
import { areDatesValid } from "../lib/validators/dates";
import { isValidIban } from "../lib/validators/iban";
import { isValidPortugueseNif } from "../lib/validators/nif";

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

console.log("\nNIF português");
check("NIF válido de empresa (Husqvarna, público)", isValidPortugueseNif("500084580"), true);
check("NIF válido de pessoa singular", isValidPortugueseNif("166055832"), true);
check("dígito de controlo errado", isValidPortugueseNif("500084581"), false);
check("prefixo inválido", isValidPortugueseNif("400084580"), false);
check("poucos dígitos", isValidPortugueseNif("12345"), false);
check("com espaços e prefixo PT", isValidPortugueseNif("PT 500 084 580"), true);
check("nulo", isValidPortugueseNif(null), false);

console.log("\nIBAN");
check("IBAN PT válido", isValidIban("PT50000201231234567890154"), true);
check("IBAN PT com espaços", isValidIban("PT50 0002 0123 1234 5678 9015 4"), true);
check("checksum errado", isValidIban("PT50000201231234567890155"), false);
check("comprimento errado para PT", isValidIban("PT5000020123123456789015"), false);
check("IBAN DE válido", isValidIban("DE89370400440532013000"), true);
check("vazio", isValidIban(""), false);

console.log("\nDatas");
const ano = new Date().getFullYear();
check("emissão antes do vencimento", areDatesValid(`${ano}-01-15`, `${ano}-02-15`), true);
check("só emissão", areDatesValid(`${ano}-01-15`, null), true);
check("vencimento antes da emissão", areDatesValid(`${ano}-03-15`, `${ano}-01-15`), false);
check("ano implausível (OCR falhou)", areDatesValid("1998-01-15", null), false);
check("sem emissão", areDatesValid(null, `${ano}-02-15`), false);

console.log("\nNomes de ficheiro no SharePoint");
check(
  "número + id do registo",
  buildFileName({ numero: "FT 2026A17/113", invoiceId: "abc-123", extension: "pdf" }),
  "FT 2026A17-113__abc-123.pdf",
);
check(
  "sem número ainda (pré-extração)",
  buildFileName({ numero: null, invoiceId: "abc-123", extension: "pdf" }),
  "abc-123.pdf",
);
check("caracteres ilegais removidos", sanitizeNumero('FT/2026:*?"<>|123'), "FT-2026-------123");

console.log("\nPastas no SharePoint");
check(
  "organização → país → ano → mês",
  buildFolderPath({ organizationId: "org-1", pais: "PT", dataEmissao: "2026-09-07" }),
  "Faturas/org-1/PT/2026/09",
);
check(
  "sem data vai para _Entrada",
  buildFolderPath({ organizationId: "org-1", pais: "fr", dataEmissao: null }),
  "Faturas/org-1/FR/_Entrada",
);
check(
  "sem país",
  buildFolderPath({ organizationId: "org-1", pais: null, dataEmissao: "2026-09-07" }),
  "Faturas/org-1/SEM-PAIS/2026/09",
);

console.log("\nDecisão de estado a partir da confiança");
const auto = { modo: "automatico" as const, limiar_alto: 0.9, limiar_baixo: 0.6 };
check("confiança alta → auto-confirmada", decideStatus(0.95, auto), "auto_confirmada");
check("confiança média → por rever", decideStatus(0.75, auto), "por_rever");
check("confiança baixa → falhada", decideStatus(0.4, auto), "falhada");
check("no limiar alto → auto-confirmada", decideStatus(0.9, auto), "auto_confirmada");
check(
  "semi-automático nunca auto-confirma",
  decideStatus(0.99, { modo: "semi_automatico", limiar_alto: 0.9, limiar_baixo: 0.6 }),
  "por_rever",
);
check(
  "manual revê sempre tudo",
  decideStatus(0.99, { modo: "manual", limiar_alto: 0.9, limiar_baixo: 0.6 }),
  "por_rever",
);

console.log("\nNormalização para deteção de duplicados");
check("separadores ignorados", normalizeNumero("FT 2026A17/113"), "FT2026A17113");
check("mesma fatura escrita de forma diferente", normalizeNumero("ft-2026a17.113"), "FT2026A17113");

console.log(`\n${passed} verificações passaram, ${failed} falharam.\n`);
process.exit(failed > 0 ? 1 : 0);
