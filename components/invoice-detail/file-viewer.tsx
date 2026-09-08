import { FileQuestion } from "lucide-react";

/**
 * O URL vem do Graph pré-autenticado e de curta duração, resolvido no servidor.
 * O browser trata da renderização (PDF nativo ou imagem), sem bibliotecas extra.
 */
export function FileViewer({
  url,
  mimeType,
  fileName,
}: {
  url: string | null;
  mimeType: string | null;
  fileName: string | null;
}) {
  if (!url) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-gray-100 p-6 text-center">
        <FileQuestion className="h-8 w-8 text-gray-400" />
        <p className="text-sm font-medium">Documento indisponível</p>
        <p className="text-sm text-muted">
          O ficheiro original não chegou a ser guardado nesta fatura.
        </p>
      </div>
    );
  }

  if (mimeType?.startsWith("image/")) {
    return (
      <div className="h-full overflow-auto bg-gray-800 p-4">
        {/* Ficheiro externo com URL temporário: next/image não acrescenta valor aqui. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={fileName ?? "Fatura"} className="mx-auto max-w-full" />
      </div>
    );
  }

  return <iframe src={url} title={fileName ?? "Fatura"} className="h-full w-full border-0" />;
}
