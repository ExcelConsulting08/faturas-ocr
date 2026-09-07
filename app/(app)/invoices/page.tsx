import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { InvoiceFilters } from "@/components/invoices/filters";
import { InvoiceTable } from "@/components/invoices/invoice-table";
import { StatCards } from "@/components/invoices/stat-cards";
import { UploadModal } from "@/components/invoices/upload-modal";
import { Card } from "@/components/ui/primitives";
import { requireOrgContext } from "@/lib/auth/context";
import {
  PAGE_SIZE,
  fetchInvoices,
  fetchStats,
  type InvoiceFilters as Filters,
} from "@/lib/invoices/queries";
import { createClient } from "@/lib/supabase/server";
import type { InvoiceStatus } from "@/types/domain";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function InvoicesPage({ searchParams }: { searchParams: SearchParams }) {
  const { organization } = await requireOrgContext();
  const params = await searchParams;
  const supabase = await createClient();

  const filters: Filters = {
    search: single(params.search),
    periodo: (single(params.periodo) as Filters["periodo"]) ?? "tudo",
    estado: (single(params.estado) as InvoiceStatus | "todos") ?? "todos",
    pagamento: (single(params.pagamento) as Filters["pagamento"]) ?? "todos",
    pais: single(params.pais),
    page: Number(single(params.page) ?? 1),
  };

  const [{ rows, total }, stats, mailboxes] = await Promise.all([
    fetchInvoices(supabase, organization.id, filters),
    fetchStats(supabase, organization.id, filters),
    supabase
      .from("country_mailboxes")
      .select("pais, empresa")
      .eq("organization_id", organization.id)
      .eq("ativo", true)
      .order("pais")
      .returns<{ pais: string; empresa: string }[]>(),
  ]);

  const paises = mailboxes.data ?? [];
  const page = filters.page ?? 1;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const pageLink = (target: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      const v = single(value);
      if (v) next.set(key, v);
    }
    next.set("page", String(target));
    return `/invoices?${next.toString()}`;
  };

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold">Faturas</h1>
        <UploadModal paises={paises} />
      </div>

      <Card className="p-4">
        <InvoiceFilters paises={paises.map((entry) => entry.pais)} />
      </Card>

      <StatCards stats={stats} />

      {stats.duplicados > 0 ? (
        <Link href="/invoices?estado=por_rever" className="block">
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <p className="font-medium text-amber-900">
                {stats.duplicados} faturas possivelmente duplicadas
              </p>
              <p className="text-sm text-amber-800">
                Reveja estas faturas para confirmar ou descartar
              </p>
            </div>
          </div>
        </Link>
      ) : null}

      <InvoiceTable rows={rows} />

      {total > PAGE_SIZE ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total} resultados
          </span>
          <div className="flex gap-3">
            {page > 1 ? (
              <Link href={pageLink(page - 1)} className="text-primary hover:underline">
                Anterior
              </Link>
            ) : null}
            {page < lastPage ? (
              <Link href={pageLink(page + 1)} className="text-primary hover:underline">
                Seguinte
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
