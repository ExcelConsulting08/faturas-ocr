export type StorageProvider = "supabase" | "sharepoint";

export interface StoredFile {
  /** Identificador estável usado para voltar a encontrar o ficheiro. */
  id: string;
  /** Contentor: o drive no SharePoint, o bucket no Supabase. */
  container: string;
  /** Caminho legível, para mostrar na interface. */
  path: string;
  name: string;
}

export interface UploadRequest {
  folderPath: string;
  fileName: string;
  buffer: Buffer;
  mimeType: string;
}

export interface MoveRequest {
  /** Identificador devolvido no upload. */
  id: string;
  newFolderPath: string;
  newFileName: string;
}

/**
 * Contrato comum aos fornecedores de armazenamento. O pipeline de faturas fala
 * apenas com esta interface, o que permite trocar de fornecedor sem lhe tocar.
 */
export interface StorageBackend {
  readonly provider: StorageProvider;
  upload(request: UploadRequest): Promise<StoredFile>;
  move(request: MoveRequest): Promise<StoredFile>;
  /** URL temporário para o visualizador; null se o ficheiro não existir. */
  getViewUrl(id: string): Promise<string | null>;
  download(id: string): Promise<Buffer>;
}
