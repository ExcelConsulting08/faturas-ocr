import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Cliente com service-role: ignora RLS. Usar apenas em código de servidor que
 * age em nome do sistema (pipeline de OCR, cron de recolha, gestão de
 * utilizadores) e nunca a partir de input não validado do utilizador.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não está configurada");
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
