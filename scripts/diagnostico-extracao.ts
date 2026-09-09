/**
 * Compara o número gravado numa fatura com o número que o modelo devolveu.
 *
 * Serve para responder a uma pergunta que de fora não se distingue: um valor
 * estranho no ecrã veio mal do modelo, ou veio bem e algo o estragou a seguir?
 * O `extraction_raw` guarda a resposta original e o modelo que respondeu, que é
 * o suficiente para separar os dois casos.
 *
 * Só lê. Não altera nada.
 *
 * Uso: npx tsx --env-file=.env.local scripts/diagnostico-extracao.ts [fragmento-do-numero]
 */
import { createClient } from "@supabase/supabase-js";

interface RawExtraction {
  modelo?: string;
  documentos?: { fatura?: { numero?: string | null } }[];
}

interface InvoiceRow {
  id: string;
  numero: string | null;
  file_name: string | null;
  source_pages: string | null;
  source_invoice_count: number | null;
  created_at: string;
  extraction_raw: RawExtraction | null;
}

async function main() {
  const fragmento = process.argv[2];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY têm de estar em .env.local");
    process.exit(1);
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let query = admin
    .from("invoices")
    .select("id, numero, file_name, source_pages, source_invoice_count, created_at, extraction_raw")
    .order("created_at", { ascending: false })
    .limit(30);

  if (fragmento) query = query.ilike("numero", `%${fragmento}%`);

  const { data, error } = await query.returns<InvoiceRow[]>();
  if (error) {
    console.error("Erro a consultar:", error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log(fragmento ? `Nenhuma fatura com "${fragmento}" no número.` : "Nenhuma fatura.");
    return;
  }

  console.log(`\n${data.length} fatura(s):\n`);

  for (const fatura of data) {
    const raw = fatura.extraction_raw;
    // A ordem dos documentos no raw é a mesma da ingestão, mas o registo não
    // guarda o índice: procura-se pelo número, e em último caso mostram-se todos.
    const numerosDoModelo = (raw?.documentos ?? []).map((d) => d.fatura?.numero ?? null);

    console.log(`  ${fatura.created_at.slice(0, 16).replace("T", " ")}  ${fatura.id.slice(0, 8)}`);
    console.log(`     gravado         "${fatura.numero}"`);
    console.log(`     modelo devolveu ${numerosDoModelo.map((n) => `"${n}"`).join(", ") || "(sem raw)"}`);
    console.log(`     modelo usado    ${raw?.modelo ?? "?"}`);
    console.log(
      `     ficheiro        ${fatura.file_name ?? "?"}  páginas ${fatura.source_pages ?? "-"}  de um lote de ${fatura.source_invoice_count ?? 1}`,
    );

    // Faturas anteriores ao suporte a lotes têm o raw no formato antigo, sem
    // "documentos". Aí não há nada para comparar — dizer que diverge seria falso.
    if (numerosDoModelo.length === 0) {
      console.log("     => raw em formato antigo (sem 'documentos'): não comparável");
    } else {
      const veioAssimDoModelo = numerosDoModelo.includes(fatura.numero);
      console.log(
        `     => ${veioAssimDoModelo ? "o valor gravado é o que o modelo devolveu" : "DIVERGE: o valor gravado não consta da resposta do modelo"}`,
      );
    }
    console.log();
  }
}

main();
