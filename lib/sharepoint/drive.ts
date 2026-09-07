import "server-only";

import { graphFetch, graphJson, isGraphConfigured } from "@/lib/graph/client";

export interface DriveItem {
  id: string;
  name: string;
  size?: number;
  webUrl?: string;
  parentReference?: { driveId?: string; id?: string; path?: string };
  "@microsoft.graph.downloadUrl"?: string;
}

/** 4 MB: acima disto o Graph exige upload em sessão com blocos. */
export const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024;
const CHUNK_SIZE = 5 * 320 * 1024; // múltiplo de 320 KiB, exigido pelo Graph

export function isSharePointConfigured(): boolean {
  return isGraphConfigured() && Boolean(process.env.SHAREPOINT_DRIVE_ID);
}

export function missingSharePointEnvVars(): string[] {
  return ["MS_GRAPH_TENANT_ID", "MS_GRAPH_CLIENT_ID", "MS_GRAPH_CLIENT_SECRET", "SHAREPOINT_DRIVE_ID"].filter(
    (name) => !process.env[name],
  );
}

export function driveId(): string {
  const id = process.env.SHAREPOINT_DRIVE_ID;
  if (!id) throw new Error("SHAREPOINT_DRIVE_ID não está configurada");
  return id;
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

/** Garante que toda a hierarquia de pastas existe, criando o que faltar. */
export async function ensureFolder(folderPath: string): Promise<string> {
  const segments = folderPath.split("/").filter(Boolean);
  let parentId = "root";

  for (const segment of segments) {
    const response = await graphFetch(`/drives/${driveId()}/items/${parentId}/children`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: segment,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    });

    if (response.ok) {
      const created = (await response.json()) as DriveItem;
      parentId = created.id;
      continue;
    }

    // 409 = já existe, que é o caso normal depois da primeira execução.
    if (response.status === 409) {
      const existing = await graphJson<DriveItem>(
        `/drives/${driveId()}/items/${parentId}:/${encodePath(segment)}`,
      );
      parentId = existing.id;
      continue;
    }

    throw new Error(`Falha a criar a pasta "${segment}": ${response.status} ${await response.text()}`);
  }

  return parentId;
}

export async function uploadFile(options: {
  folderPath: string;
  fileName: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<DriveItem> {
  const folderId = await ensureFolder(options.folderPath);
  const fullPath = `${options.folderPath}/${options.fileName}`;

  if (options.buffer.byteLength <= SIMPLE_UPLOAD_LIMIT) {
    const response = await graphFetch(
      `/drives/${driveId()}/items/${folderId}:/${encodePath(options.fileName)}:/content`,
      {
        method: "PUT",
        headers: { "Content-Type": options.mimeType },
        body: new Uint8Array(options.buffer),
      },
    );

    if (!response.ok) {
      throw new Error(`Falha no upload de ${fullPath}: ${response.status} ${await response.text()}`);
    }

    return (await response.json()) as DriveItem;
  }

  return uploadLargeFile({ ...options, folderId });
}

async function uploadLargeFile(options: {
  folderId: string;
  fileName: string;
  buffer: Buffer;
}): Promise<DriveItem> {
  const session = await graphJson<{ uploadUrl: string }>(
    `/drives/${driveId()}/items/${options.folderId}:/${encodePath(options.fileName)}:/createUploadSession`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "replace" } }),
    },
  );

  const total = options.buffer.byteLength;

  for (let start = 0; start < total; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, total) - 1;
    const chunk = options.buffer.subarray(start, end + 1);

    // A upload session já vem pré-autenticada: não leva o token do Graph.
    const response = await fetch(session.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(chunk.byteLength),
        "Content-Range": `bytes ${start}-${end}/${total}`,
      },
      body: new Uint8Array(chunk),
    });

    if (response.status === 200 || response.status === 201) {
      return (await response.json()) as DriveItem;
    }

    if (response.status !== 202) {
      throw new Error(`Falha no bloco ${start}-${end}: ${response.status} ${await response.text()}`);
    }
  }

  throw new Error("A upload session terminou sem devolver o ficheiro final");
}

/** Move e/ou renomeia um item pelo seu id — a referência nunca se parte. */
export async function moveOrRenameItem(options: {
  itemId: string;
  newName?: string;
  newFolderPath?: string;
}): Promise<DriveItem> {
  const payload: Record<string, unknown> = {};

  if (options.newName) payload.name = options.newName;

  if (options.newFolderPath) {
    const folderId = await ensureFolder(options.newFolderPath);
    payload.parentReference = { id: folderId };
  }

  if (Object.keys(payload).length === 0) {
    return getItem(options.itemId);
  }

  return graphJson<DriveItem>(`/drives/${driveId()}/items/${options.itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function getItem(itemId: string): Promise<DriveItem> {
  return graphJson<DriveItem>(`/drives/${driveId()}/items/${itemId}`);
}

/** URL pré-autenticado de curta duração para o visualizador de PDF. */
export async function getDownloadUrl(itemId: string): Promise<string | null> {
  const item = await graphJson<DriveItem>(
    `/drives/${driveId()}/items/${itemId}?select=id,name,@microsoft.graph.downloadUrl`,
  );
  return item["@microsoft.graph.downloadUrl"] ?? null;
}

export async function downloadItem(itemId: string): Promise<Buffer> {
  const response = await graphFetch(`/drives/${driveId()}/items/${itemId}/content`);
  if (!response.ok) {
    throw new Error(`Falha a descarregar o item ${itemId}: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/** Caminho legível a partir da resposta do Graph, para mostrar na UI. */
export function readablePath(item: DriveItem): string {
  const parentPath = item.parentReference?.path ?? "";
  const cleaned = parentPath.replace(/^\/drives\/[^/]+\/root:?/, "");
  return `${cleaned}/${item.name}`.replace(/\/+/g, "/");
}
