import { NextResponse, type NextRequest } from "next/server";

import { pollAllMailboxes } from "@/lib/email-ingest/poll";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

/**
 * Alvo do agendador (Vercel Cron ou equivalente externo), invocado ao minuto.
 * Corre com service-role: age em nome do sistema, sem sessão de utilizador.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 500 });
  }

  const authorized =
    request.headers.get("authorization") === `Bearer ${secret}` ||
    request.nextUrl.searchParams.get("secret") === secret;

  if (!authorized) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: settings } = await supabase
    .from("collection_settings")
    .select("organization_id, loop_ativo, intervalo_segundos")
    .eq("loop_ativo", true)
    .returns<{ organization_id: string; loop_ativo: boolean; intervalo_segundos: number }[]>();

  const results = [];
  for (const entry of settings ?? []) {
    results.push({
      organizationId: entry.organization_id,
      summaries: await pollAllMailboxes(supabase, entry.organization_id, "loop"),
    });
  }

  return NextResponse.json({ ok: true, organizations: results.length, results });
}
