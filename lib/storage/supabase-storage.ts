import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  MoveRequest,
  StorageBackend,
  StoredFile,
  UploadRequest,
} from "@/lib/storage/types";

const BUCKET = "faturas";
const SIGNED_URL_SECONDS = 3600;

/**
 * Armazenamento no Supabase Storage.
 *
 * Ao contrário do SharePoint, aqui não existe um id independente do caminho:
 * o caminho *é* o identificador. Por isso mover um ficheiro muda o seu id, e
 * quem chama tem de gravar o novo valor devolvido por `move`.
 *
 * Todas as operações usam a service-role: o bucket é privado e sem políticas,
 * e quem valida as permissões é o servidor antes de chegar aqui.
 */
class SupabaseStorage implements StorageBackend {
  readonly provider = "supabase" as const;

  async upload({ folderPath, fileName, buffer, mimeType }: UploadRequest): Promise<StoredFile> {
    const path = `${folderPath}/${fileName}`;
    const admin = createAdminClient();

    const { error } = await admin.storage.from(BUCKET).upload(path, buffer, {
      contentType: mimeType,
      upsert: true,
    });

    if (error) throw new Error(`Falha ao guardar ${path}: ${error.message}`);

    return { id: path, container: BUCKET, path: `/${path}`, name: fileName };
  }

  async move({ id, newFolderPath, newFileName }: MoveRequest): Promise<StoredFile> {
    const destino = `${newFolderPath}/${newFileName}`;
    if (destino === id) {
      return { id, container: BUCKET, path: `/${id}`, name: newFileName };
    }

    const admin = createAdminClient();
    const { error } = await admin.storage.from(BUCKET).move(id, destino);

    if (error) throw new Error(`Falha ao mover para ${destino}: ${error.message}`);

    return { id: destino, container: BUCKET, path: `/${destino}`, name: newFileName };
  }

  async getViewUrl(id: string): Promise<string | null> {
    const admin = createAdminClient();
    const { data } = await admin.storage.from(BUCKET).createSignedUrl(id, SIGNED_URL_SECONDS);
    return data?.signedUrl ?? null;
  }

  async download(id: string): Promise<Buffer> {
    const admin = createAdminClient();
    const { data, error } = await admin.storage.from(BUCKET).download(id);

    if (error || !data) throw new Error(`Falha ao descarregar ${id}: ${error?.message}`);

    return Buffer.from(await data.arrayBuffer());
  }
}

export const supabaseStorage = new SupabaseStorage();
