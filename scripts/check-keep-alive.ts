/**
 * Confirma que a migração 0004 foi aplicada e mostra o histórico de pings.
 * Uso: npx tsx --env-file=.env.local scripts/check-keep-alive.ts
 */
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em .env.local");
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data, error } = await supabase
    .from("db_pings")
    .select("dia, tentativa, sucesso, erro, duracao_ms, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error(`\n✗ A tabela db_pings não está acessível: ${error.message}`);
    console.error("  Aplica supabase/migrations/0004_keep_alive.sql no SQL Editor do Supabase.\n");
    process.exit(1);
  }

  console.log("\n✓ Tabela db_pings acessível.");
  if (!data?.length) {
    console.log("  Ainda sem pings registados.\n");
    return;
  }

  console.log("\n  Últimos pings:");
  for (const p of data) {
    const marca = p.sucesso ? "ok  " : "FALHA";
    const extra = p.sucesso ? `${p.duracao_ms}ms` : (p.erro ?? "");
    console.log(`    ${marca}  ${p.dia}  tentativa ${p.tentativa}  ${extra}`);
  }
  console.log();
}

main();
