import { MailboxesView } from "@/components/mailboxes/mailboxes-view";
import { requireAdmin } from "@/lib/auth/context";
import { isExtractionEngineReady } from "@/lib/ocr/extract";
import { storageProviderName } from "@/lib/storage";
import { missingGraphEnvVars } from "@/lib/graph/client";
import { createClient } from "@/lib/supabase/server";
import type { CollectionRun, CollectionSettings, CountryMailbox } from "@/types/domain";

export const dynamic = "force-dynamic";

export interface MailboxWithCount extends CountryMailbox {
  invoiceCount: number;
}

export default async function MailboxesPage() {
  const { organization } = await requireAdmin();
  const supabase = await createClient();

  const [mailboxesResult, settingsResult, runsResult, invoicesResult, emailTotalResult] =
    await Promise.all([
      supabase
        .from("country_mailboxes")
        .select("*")
        .eq("organization_id", organization.id)
        .order("pais")
        .returns<CountryMailbox[]>(),
      supabase
        .from("collection_settings")
        .select("*")
        .eq("organization_id", organization.id)
        .maybeSingle<CollectionSettings>(),
      supabase
        .from("collection_runs")
        .select("*")
        .eq("organization_id", organization.id)
        .order("started_at", { ascending: false })
        .limit(20)
        .returns<CollectionRun[]>(),
      supabase
        .from("invoices")
        .select("pais")
        .eq("organization_id", organization.id)
        .eq("origin", "email")
        .is("discarded_at", null)
        .returns<{ pais: string | null }[]>(),
      supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization.id)
        .is("discarded_at", null),
    ]);

  const emailInvoices = invoicesResult.data ?? [];

  const mailboxes: MailboxWithCount[] = (mailboxesResult.data ?? []).map((mailbox) => ({
    ...mailbox,
    invoiceCount: emailInvoices.filter((row) => row.pais === mailbox.pais).length,
  }));

  const runs = runsResult.data ?? [];
  const lastRun = runs.find((run) => run.finished_at) ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <MailboxesView
        mailboxes={mailboxes}
        settings={settingsResult.data}
        lastRun={lastRun}
        totalInSystem={emailTotalResult.count ?? 0}
        extractionReady={isExtractionEngineReady()}
        missingGraphVars={missingGraphEnvVars()}
        storageName={storageProviderName()}
      />
    </div>
  );
}
