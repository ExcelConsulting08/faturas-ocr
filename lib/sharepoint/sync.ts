import "server-only";

import { isSharePointConfigured, moveOrRenameItem, readablePath } from "@/lib/sharepoint/drive";
import {
  buildFileName,
  buildFolderPath,
  discardedFolderPath,
  extensionFor,
} from "@/lib/sharepoint/paths";
import type { Invoice } from "@/types/domain";

export interface SyncResult {
  sharepoint_path: string;
  file_name: string;
}

/**
 * Alinha o ficheiro no SharePoint com o estado atual do registo: renomeia quando
 * o número muda e move quando muda a data de emissão ou o país.
 *
 * Corre depois da gravação em base de dados e nunca a bloqueia — se o Graph
 * falhar, os dados continuam corretos e o ficheiro é reconciliado numa próxima
 * tentativa. Como o nome inclui o invoice_id, não há risco de colisão entretanto.
 */
export async function syncInvoiceFile(invoice: Pick<
  Invoice,
  | "id"
  | "organization_id"
  | "sharepoint_item_id"
  | "numero"
  | "pais"
  | "data_emissao"
  | "file_name"
  | "mime_type"
  | "discarded_at"
>): Promise<SyncResult | null> {
  if (!invoice.sharepoint_item_id || !isSharePointConfigured()) return null;

  const extension = extensionFor(invoice.file_name ?? "", invoice.mime_type ?? "application/pdf");

  const newName = buildFileName({
    numero: invoice.numero,
    invoiceId: invoice.id,
    extension,
  });

  const newFolderPath = invoice.discarded_at
    ? discardedFolderPath({ organizationId: invoice.organization_id, pais: invoice.pais })
    : buildFolderPath({
        organizationId: invoice.organization_id,
        pais: invoice.pais,
        dataEmissao: invoice.data_emissao,
      });

  const item = await moveOrRenameItem({
    itemId: invoice.sharepoint_item_id,
    newName,
    newFolderPath,
  });

  return { sharepoint_path: readablePath(item), file_name: item.name };
}
