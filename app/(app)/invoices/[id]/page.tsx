import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { FileViewer } from "@/components/invoice-detail/file-viewer";
import { InvoiceForm } from "@/components/invoice-detail/invoice-form";
import { canWrite, requireOrgContext } from "@/lib/auth/context";
import { getDownloadUrl, isSharePointConfigured } from "@/lib/sharepoint/drive";
import { createClient } from "@/lib/supabase/server";
import type { CostCenter, InvoiceWithRelations } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organization, member } = await requireOrgContext();
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select(
      "*, supplier:suppliers(*), cost_center:cost_centers(*), line_items:invoice_line_items(*)",
    )
    .eq("id", id)
    .eq("organization_id", organization.id)
    .maybeSingle<InvoiceWithRelations>();

  if (!invoice) notFound();

  const [costCenters, mailboxes] = await Promise.all([
    supabase
      .from("cost_centers")
      .select("*")
      .eq("organization_id", organization.id)
      .order("nome")
      .returns<CostCenter[]>(),
    supabase
      .from("country_mailboxes")
      .select("pais")
      .eq("organization_id", organization.id)
      .order("pais")
      .returns<{ pais: string }[]>(),
  ]);

  let downloadUrl: string | null = null;
  if (invoice.sharepoint_item_id && isSharePointConfigured()) {
    try {
      downloadUrl = await getDownloadUrl(invoice.sharepoint_item_id);
    } catch {
      // Sem URL o visualizador mostra o estado vazio; os dados continuam editáveis.
    }
  }

  const lineItems = [...(invoice.line_items ?? [])].sort((a, b) => a.posicao - b.posicao);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border bg-surface px-5 py-2.5">
        <Link href="/invoices" className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Faturas
        </Link>
        {invoice.sharepoint_path ? (
          <span className="truncate text-xs text-gray-400">{invoice.sharepoint_path}</span>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <div className="min-h-[400px] border-r border-border bg-gray-800">
          <FileViewer
            url={downloadUrl}
            mimeType={invoice.mime_type}
            fileName={invoice.file_name}
          />
        </div>

        <div className="min-h-0 overflow-hidden">
          <InvoiceForm
            invoice={{ ...invoice, line_items: lineItems, tags: [] }}
            costCenters={costCenters.data ?? []}
            paises={(mailboxes.data ?? []).map((entry) => entry.pais)}
            readOnly={!canWrite(member)}
          />
        </div>
      </div>
    </div>
  );
}
