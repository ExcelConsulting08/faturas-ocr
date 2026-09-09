import Link from "next/link";
import { Files } from "lucide-react";

import { Badge } from "@faturas/ui";

export interface SiblingInvoice {
  id: string;
  numero: string | null;
  source_pages: string | null;
}

/**
 * Aviso de proveniência: esta fatura chegou dentro de um documento que trazia
 * várias.
 *
 * Sem isto, quem abre a fatura vê um PDF de duas páginas e não tem como saber
 * que existem mais faturas do mesmo envio — nem que o número que está a
 * corrigir pertence a uma de várias.
 */
export function SourceDocument({
  atual,
  irmas,
  paginas,
}: {
  atual: string;
  irmas: SiblingInvoice[];
  paginas: string | null;
}) {
  if (irmas.length === 0) return null;

  const todas = [...irmas].sort((a, b) => ordem(a.source_pages) - ordem(b.source_pages));
  const posicao = todas.findIndex((entry) => entry.id === atual) + 1;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-sky-200 bg-sky-50 px-5 py-2.5 text-sm text-sky-900">
      <Files className="h-4 w-4 shrink-0" />

      <span>
        {posicao > 0 ? (
          <>
            Fatura <span className="font-medium">{posicao}</span> de{" "}
            <span className="font-medium">{todas.length}</span> do mesmo documento
          </>
        ) : (
          <>Uma de {todas.length} faturas do mesmo documento</>
        )}
        {paginas ? <span className="text-sky-700"> · páginas {paginas}</span> : null}
      </span>

      <span className="flex flex-wrap items-center gap-1.5">
        {todas.map((irma) =>
          irma.id === atual ? (
            <Badge key={irma.id} tone="sky">
              {irma.numero ?? "sem número"}
            </Badge>
          ) : (
            <Link
              key={irma.id}
              href={`/invoices/${irma.id}`}
              className="rounded-md px-2 py-0.5 text-xs font-medium text-sky-800 underline decoration-sky-300 underline-offset-2 transition-colors hover:bg-sky-100"
            >
              {irma.numero ?? "sem número"}
            </Link>
          ),
        )}
      </span>
    </div>
  );
}

/** Ordena pelas páginas de origem, para a lista seguir a ordem do documento. */
function ordem(paginas: string | null): number {
  const primeira = Number(paginas?.split("-")[0]);
  return Number.isFinite(primeira) ? primeira : Number.MAX_SAFE_INTEGER;
}
