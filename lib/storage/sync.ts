import "server-only";

import { getStorageFor } from "@/lib/storage";
import {
  buildFileName,
  buildFolderPath,
  discardedFolderPath,
  extensionFor,
} from "@/lib/sharepoint/paths";
import type { Invoice } from "@/types/domain";

export interface SyncResult {
  storage_id: string;
  storage_container: string;
  storage_path: string;
  file_name: string;
}

/**
 * Alinha o ficheiro guardado com o estado atual do registo: renomeia quando o
 * número muda e move quando muda a data de emissão ou o país.
 *
 * Corre depois da gravação em base de dados e nunca a bloqueia — se o
 * armazenamento falhar, os dados continuam corretos e o ficheiro é reconciliado
 * numa próxima tentativa. Como o nome inclui o invoice_id, não há colisões
 * entretanto.
 */
export async function syncInvoiceFile(invoice: Pick<
  Invoice,
  | "id"
  | "organization_id"
  | "storage_provider"
  | "storage_id"
  | "numero"
  | "pais"
  | "data_emissao"
  | "file_name"
  | "mime_type"
  | "discarded_at"
>): Promise<SyncResult | null> {
  const storage = getStorageFor(invoice.storage_provider);
  if (!storage || !invoice.storage_id) return null;

  const extension = extensionFor(invoice.file_name ?? "", invoice.mime_type ?? "application/pdf");

  const newFileName = buildFileName({
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

  const stored = await storage.move({
    id: invoice.storage_id,
    newFolderPath,
    newFileName,
  });

  return {
    storage_id: stored.id,
    storage_container: stored.container,
    storage_path: stored.path,
    file_name: stored.name,
  };
}
