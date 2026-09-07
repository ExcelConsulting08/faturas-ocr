import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const TIMEOUT_MS = 10_000;
export const SIGNATURE_HEADER = "X-Faturas-Signature";

/** HMAC-SHA256 sobre os bytes exatos do corpo enviado. */
export function signPayload(rawBody: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
}

export function verifySignature(rawBody: string, secret: string, signature: string): boolean {
  const expected = Buffer.from(signPayload(rawBody, secret));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export interface DeliveryResult {
  succeeded: boolean;
  status?: number;
  error?: string;
}

export async function deliverInvoice(
  supabase: SupabaseClient,
  options: {
    organizationId: string;
    invoiceId: string;
    attemptNumber?: number;
  },
): Promise<DeliveryResult> {
  const { data: settings } = await supabase
    .from("erp_integration_settings")
    .select("webhook_url, secret")
    .eq("organization_id", options.organizationId)
    .maybeSingle<{ webhook_url: string | null; secret: string }>();

  if (!settings?.webhook_url) {
    return { succeeded: false, error: "Webhook ERP não configurado" };
  }

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*, supplier:suppliers(*), cost_center:cost_centers(nome), line_items:invoice_line_items(*)")
    .eq("id", options.invoiceId)
    .eq("organization_id", options.organizationId)
    .maybeSingle();

  if (!invoice) return { succeeded: false, error: "Fatura não encontrada" };

  const rawBody = JSON.stringify({ evento: "fatura.confirmada", fatura: invoice });
  const signature = signPayload(rawBody, settings.secret);

  let status: number | undefined;
  let responseBody = "";
  let error: string | undefined;

  try {
    const response = await fetch(settings.webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json", [SIGNATURE_HEADER]: signature },
      body: rawBody,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    status = response.status;
    responseBody = (await response.text()).slice(0, 2000);
  } catch (err) {
    error = err instanceof Error ? err.message : "Erro de rede";
  }

  const succeeded = status !== undefined && status >= 200 && status < 300;

  await supabase.from("webhook_delivery_log").insert({
    organization_id: options.organizationId,
    invoice_id: options.invoiceId,
    attempt_number: options.attemptNumber ?? 1,
    request_body: JSON.parse(rawBody),
    response_status: status ?? null,
    response_body: responseBody || null,
    succeeded,
    error_message: error ?? null,
  });

  return { succeeded, status, error };
}
