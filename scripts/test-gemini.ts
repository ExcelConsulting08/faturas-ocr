/**
 * Testa a extração real contra a fatura fictícia, para comparar modelos.
 * Uso: npx tsx --env-file=.env.local scripts/test-gemini.ts [modelo...]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ESPERADO = {
  fornecedor: "Papelaria Ficticia Unipessoal, Lda.",
  nif: "501442600",
  numero: "FT 2026A/00147",
  data_emissao: "2026-09-03",
  total: 1458.16,
};

async function main() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.error("GEMINI_API_KEY em falta");
    process.exit(1);
  }

  const modelos = process.argv.slice(2);
  if (modelos.length === 0) modelos.push("gemini-2.5-flash", "gemini-flash-latest");

  const pdf = readFileSync(join(process.cwd(), "scripts", "fixtures", "fatura-exemplo.pdf"));

  for (const modelo of modelos) {
    const inicio = Date.now();
    process.stdout.write(`\n${modelo}: `);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  { inlineData: { mimeType: "application/pdf", data: pdf.toString("base64") } },
                  {
                    text: "Extrai desta fatura, em JSON: fornecedor_nome, fornecedor_nif, numero, data_emissao (AAAA-MM-DD), total (numero).",
                  },
                ],
              },
            ],
            generationConfig: { temperature: 0, responseMimeType: "application/json" },
          }),
        },
      );

      const segundos = ((Date.now() - inicio) / 1000).toFixed(1);

      if (!response.ok) {
        const texto = await response.text();
        const match = texto.match(/"message":\s*"([^"]+)"/);
        console.log(`ERRO ${response.status} em ${segundos}s — ${match?.[1] ?? texto.slice(0, 120)}`);
        continue;
      }

      const data = await response.json();
      const texto = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const extraido = JSON.parse(texto);

      console.log(`OK em ${segundos}s`);
      console.log("   fornecedor:", extraido.fornecedor_nome, "|", ESPERADO.fornecedor === extraido.fornecedor_nome ? "correto" : `esperado "${ESPERADO.fornecedor}"`);
      console.log("   NIF:", extraido.fornecedor_nif, "|", ESPERADO.nif === String(extraido.fornecedor_nif) ? "correto" : `esperado ${ESPERADO.nif}`);
      console.log("   número:", extraido.numero, "|", ESPERADO.numero === extraido.numero ? "correto" : `esperado ${ESPERADO.numero}`);
      console.log("   emissão:", extraido.data_emissao, "|", ESPERADO.data_emissao === extraido.data_emissao ? "correto" : `esperado ${ESPERADO.data_emissao}`);
      console.log("   total:", extraido.total, "|", Math.abs(Number(extraido.total) - ESPERADO.total) < 0.02 ? "correto" : `esperado ${ESPERADO.total}`);
    } catch (error) {
      console.log("FALHOU —", error instanceof Error ? error.message.slice(0, 150) : error);
    }
  }
}

main();
