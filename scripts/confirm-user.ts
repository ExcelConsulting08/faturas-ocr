/**
 * Confirma manualmente o email de um utilizador, para contas criadas antes de
 * se desligar a confirmação por email no Supabase.
 *
 * Uso: npx tsx --env-file=.env.local scripts/confirm-user.ts <email>
 */
import { createClient } from "@supabase/supabase-js";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Indique o email: npx tsx --env-file=.env.local scripts/confirm-user.ts <email>");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY têm de estar em .env.local");
    process.exit(1);
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) {
    console.error("Erro a listar utilizadores:", error.message);
    process.exit(1);
  }

  const user = data.users.find((entry) => entry.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    console.error(`Não existe nenhum utilizador com o email ${email}.`);
    console.error("Existentes:", data.users.map((entry) => entry.email).join(", ") || "(nenhum)");
    process.exit(1);
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    email_confirm: true,
  });

  if (updateError) {
    console.error("Erro a confirmar:", updateError.message);
    process.exit(1);
  }

  console.log(`Email de ${email} confirmado. Já pode iniciar sessão.`);
}

main();
