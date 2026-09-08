import "server-only";

import {
  downloadItem,
  getDownloadUrl,
  moveOrRenameItem,
  readablePath,
  uploadFile,
} from "@/lib/sharepoint/drive";
import type {
  MoveRequest,
  StorageBackend,
  StoredFile,
  UploadRequest,
} from "@/lib/storage/types";

/**
 * Armazenamento no SharePoint da empresa via Microsoft Graph.
 *
 * Aqui o identificador do item é independente do caminho, pelo que sobrevive a
 * renomeações e mudanças de pasta — ao contrário do Supabase Storage.
 */
class SharePointStorage implements StorageBackend {
  readonly provider = "sharepoint" as const;

  async upload(request: UploadRequest): Promise<StoredFile> {
    const item = await uploadFile(request);
    return {
      id: item.id,
      container: item.parentReference?.driveId ?? "",
      path: readablePath(item),
      name: item.name,
    };
  }

  async move({ id, newFolderPath, newFileName }: MoveRequest): Promise<StoredFile> {
    const item = await moveOrRenameItem({
      itemId: id,
      newName: newFileName,
      newFolderPath,
    });

    return {
      id: item.id,
      container: item.parentReference?.driveId ?? "",
      path: readablePath(item),
      name: item.name,
    };
  }

  async getViewUrl(id: string): Promise<string | null> {
    return getDownloadUrl(id);
  }

  async download(id: string): Promise<Buffer> {
    return downloadItem(id);
  }
}

export const sharePointStorage = new SharePointStorage();
