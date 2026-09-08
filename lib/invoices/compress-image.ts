/** Lado maior da imagem após redimensionar. Suficiente para ler texto de faturas. */
const MAX_DIMENSION = 2400;
const JPEG_QUALITY = 0.85;
/** Abaixo disto não vale a pena recomprimir. */
const SKIP_BELOW_BYTES = 700 * 1024;

const COMPRESSIBLE = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Reduz fotografias de faturas antes do envio.
 *
 * Uma foto de telemóvel ronda os 12 MP e vários MB, o que estoira o limite do
 * corpo dos Server Actions e não acrescenta legibilidade nenhuma ao OCR — o
 * texto de uma fatura lê-se bem a 2400px no lado maior.
 *
 * PDFs e formatos que o browser não decoda (HEIC, TIFF) passam intactos.
 */
export async function compressImage(file: File): Promise<File> {
  if (!COMPRESSIBLE.has(file.type) || file.size < SKIP_BELOW_BYTES) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );

    // Se a compressão não ajudou, fica o original.
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], trocarExtensaoParaJpg(file.name), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    // Formato que o browser não consegue decodar: segue como está e o servidor
    // trata dele (ou rejeita com uma mensagem clara).
    return file;
  }
}

function trocarExtensaoParaJpg(nome: string): string {
  return nome.replace(/\.[^.]+$/, "") + ".jpg";
}
