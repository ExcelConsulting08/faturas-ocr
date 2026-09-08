"use client";

import { useState } from "react";
import { FileQuestion } from "lucide-react";

import { cn } from "@/lib/utils";

export interface ViewerSource {
  url: string | null;
  mimeType: string | null;
  fileName: string | null;
}

/**
 * O URL vem pré-autenticado e de curta duração, resolvido no servidor.
 * O browser trata da renderização (PDF nativo ou imagem), sem bibliotecas extra.
 */
export function FileViewer({
  enviada,
  original,
}: {
  enviada: ViewerSource;
  original: ViewerSource | null;
}) {
  const [vista, setVista] = useState<"enviada" | "original">("enviada");
  const atual = vista === "original" && original ? original : enviada;

  return (
    <div className="flex h-full flex-col">
      {original?.url ? (
        <div className="flex shrink-0 items-center gap-1 border-b border-border bg-surface px-3 py-2">
          <Aba ativa={vista === "enviada"} onClick={() => setVista("enviada")}>
            Processada
          </Aba>
          <Aba ativa={vista === "original"} onClick={() => setVista("original")}>
            Original
          </Aba>
          <span className="ml-2 text-xs text-muted">
            {vista === "enviada"
              ? "Versão reduzida que foi lida pelo motor de extração"
              : "Fotografia tal como foi carregada"}
          </span>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <Conteudo source={atual} />
      </div>
    </div>
  );
}

function Aba({
  ativa,
  onClick,
  children,
}: {
  ativa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1 text-sm transition-colors",
        ativa ? "bg-indigo-50 font-medium text-primary" : "text-muted hover:bg-gray-100",
      )}
    >
      {children}
    </button>
  );
}

function Conteudo({ source }: { source: ViewerSource }) {
  if (!source.url) {
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

  if (source.mimeType?.startsWith("image/")) {
    return (
      <div className="h-full overflow-auto bg-gray-800 p-4">
        {/* Ficheiro externo com URL temporário: next/image não acrescenta valor aqui. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={source.url} alt={source.fileName ?? "Fatura"} className="mx-auto max-w-full" />
      </div>
    );
  }

  return (
    <iframe src={source.url} title={source.fileName ?? "Fatura"} className="h-full w-full border-0" />
  );
}
