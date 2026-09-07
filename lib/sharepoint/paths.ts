const ILLEGAL_CHARS = /[\\/:*?"<>|#%{}~&]/g;
const MAX_NUMBER_LENGTH = 80;

export function rootFolder(): string {
  return process.env.SHAREPOINT_ROOT_FOLDER || "Faturas";
}

/** Torna o número da fatura seguro para nome de ficheiro no SharePoint. */
export function sanitizeNumero(numero: string | null | undefined): string | null {
  if (!numero) return null;
  const clean = numero
    .replace(ILLEGAL_CHARS, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NUMBER_LENGTH);
  return clean.length > 0 ? clean : null;
}

export function extensionFor(fileName: string, mimeType: string): string {
  const fromName = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : null;
  if (fromName && fromName.length <= 5) return fromName;

  const map: Record<string, string> = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/tiff": "tiff",
  };
  return map[mimeType] ?? "bin";
}

/**
 * Nome final do ficheiro: número original da fatura + chave do registo.
 * O invoice_id garante unicidade e a correspondência inequívoca ao registo,
 * mesmo quando dois fornecedores usam o mesmo número.
 */
export function buildFileName(options: {
  numero: string | null | undefined;
  invoiceId: string;
  extension: string;
}): string {
  const numero = sanitizeNumero(options.numero);
  const base = numero ? `${numero}__${options.invoiceId}` : options.invoiceId;
  return `${base}.${options.extension}`;
}

/** Pasta de trabalho: /Faturas/{org}/{PAÍS}/{ANO}/{MÊS} */
export function buildFolderPath(options: {
  organizationId: string;
  pais: string | null | undefined;
  dataEmissao: string | null | undefined;
}): string {
  const pais = (options.pais || "SEM-PAIS").toUpperCase();

  if (!options.dataEmissao) {
    return `${rootFolder()}/${options.organizationId}/${pais}/_Entrada`;
  }

  const date = new Date(options.dataEmissao);
  if (Number.isNaN(date.getTime())) {
    return `${rootFolder()}/${options.organizationId}/${pais}/_Entrada`;
  }

  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  return `${rootFolder()}/${options.organizationId}/${pais}/${ano}/${mes}`;
}

export function discardedFolderPath(options: {
  organizationId: string;
  pais: string | null | undefined;
}): string {
  const pais = (options.pais || "SEM-PAIS").toUpperCase();
  return `${rootFolder()}/${options.organizationId}/${pais}/_Descartadas`;
}
