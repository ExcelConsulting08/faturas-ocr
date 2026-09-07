import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { deliverInvoice } from "@/lib/webhooks/deliver";

const MAX_ATTEMPTS = 5;
const MAX_PER_RUN = 25;

/** Retenta entregas de webhook falhadas, com um teto de tentativas por fatura. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 500 });
  }

  const authorized =
    request.headers.get("authorization") === `Bearer ${secret}` ||
    request.nextUrl.searchParams.get("secret") === secret;

  if (!authorized) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const supabase = createAdminClient();

  const { data: logs } = await supabase
    .from("webhook_delivery_log")
    .select("organization_id, invoice_id, attempt_number, succeeded")
    .order("created_at", { ascending: false })
    .limit(500)
    .returns<
      {
        organization_id: string;
        invoice_id: string | null;
        attempt_number: number;
        succeeded: boolean;
      }[]
    >();

  // Só interessa a última tentativa de cada fatura: se essa correu bem, está entregue.
  const latestByInvoice = new Map<string, { organizationId: string; attempt: number }>();
  const delivered = new Set<string>();

  for (const log of logs ?? []) {
    if (!log.invoice_id) continue;
    if (latestByInvoice.has(log.invoice_id) || delivered.has(log.invoice_id)) continue;

    if (log.succeeded) {
      delivered.add(log.invoice_id);
    } else {
      latestByInvoice.set(log.invoice_id, {
        organizationId: log.organization_id,
        attempt: log.attempt_number,
      });
    }
  }

  const results = [];
  for (const [invoiceId, entry] of [...latestByInvoice].slice(0, MAX_PER_RUN)) {
    if (entry.attempt >= MAX_ATTEMPTS) continue;

    const result = await deliverInvoice(supabase, {
      organizationId: entry.organizationId,
      invoiceId,
      attemptNumber: entry.attempt + 1,
    });

    results.push({ invoiceId, succeeded: result.succeeded });
  }

  return NextResponse.json({ ok: true, retried: results.length, results });
}
