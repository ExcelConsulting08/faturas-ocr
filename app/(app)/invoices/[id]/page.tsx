import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { FileViewer } from "@/components/invoice-detail/file-viewer";
import { InvoiceForm } from "@/components/invoice-detail/invoice-form";
import { SourceDocument, type SiblingInvoice } from "@/components/invoice-detail/source-document";
import { canWrite, requireOrgContext } from "@/lib/auth/context";
import { getStorageFor } from "@/lib/storage";
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

  // As "irmãs": as outras faturas que vieram no mesmo documento. Sem
  // source_group_id não há consulta nenhuma — o caso simples não paga por isto.
  const irmasQuery = invoice.source_group_id
    ? supabase
        .from("invoices")
        .select("id, numero, source_pages")
        .eq("organization_id", organization.id)
        .eq("source_group_id", invoice.source_group_id)
        .is("discarded_at", null)
        .returns<SiblingInvoice[]>()
    : null;

  const [costCenters, mailboxes, irmas] = await Promise.all([
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
    irmasQuery,
  ]);

  const storage = getStorageFor(invoice.storage_provider);

  const urlDe = async (id: string | null) => {
    if (!storage || !id) return null;
    try {
      return await storage.getViewUrl(id);
    } catch {
      // Sem URL o visualizador mostra o estado vazio; os dados continuam editáveis.
      return null;
    }
  };

  const [downloadUrl, originalUrl] = await Promise.all([
    urlDe(invoice.storage_id),
    urlDe(invoice.storage_original_id),
  ]);

  const lineItems = [...(invoice.line_items ?? [])].sort((a, b) => a.posicao - b.posicao);
  const veioDeLote = Boolean(invoice.source_group_id);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border bg-surface px-5 py-2.5">
        <Link href="/invoices" className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Faturas
        </Link>
        {invoice.storage_path ? (
          <span className="truncate text-xs text-gray-400">{invoice.storage_path}</span>
        ) : null}
      </div>

      <SourceDocument
        atual={invoice.id}
        irmas={irmas?.data ?? []}
        paginas={invoice.source_pages}
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <div className="min-h-[400px] border-r border-border bg-gray-800">
          <FileViewer
            enviada={{
              url: downloadUrl,
              mimeType: invoice.mime_type,
              fileName: invoice.file_name,
            }}
            original={
              originalUrl
                ? {
                    url: originalUrl,
                    // Num lote, o original é o documento completo e mantém o
                    // seu tipo; numa fotografia comprimida é sempre uma imagem.
                    mimeType: veioDeLote ? invoice.mime_type : "image/jpeg",
                    fileName: invoice.file_name,
                  }
                : null
            }
            tipoOriginal={veioDeLote ? "documento-origem" : "imagem-comprimida"}
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
