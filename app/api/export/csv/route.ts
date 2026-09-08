import Papa from "papaparse";
import { NextResponse, type NextRequest } from "next/server";

import { requireOrgContext } from "@/lib/auth/context";
import { fetchInvoices, type InvoiceFilters } from "@/lib/invoices/queries";
import { createClient } from "@/lib/supabase/server";
import type { InvoiceStatus } from "@/types/domain";

const MAX_ROWS = 5000;

export async function GET(request: NextRequest) {
  const { organization } = await requireOrgContext();
  const supabase = await createClient();
  const params = request.nextUrl.searchParams;

  const filters: InvoiceFilters = {
    search: params.get("search") ?? undefined,
    periodo: (params.get("periodo") as InvoiceFilters["periodo"]) ?? "tudo",
    estado: (params.get("estado") as InvoiceStatus | "todos") ?? "todos",
    pagamento: (params.get("pagamento") as InvoiceFilters["pagamento"]) ?? "todos",
    pais: params.get("pais") ?? undefined,
  };

  // Percorre as páginas até esgotar os resultados ou atingir o teto de segurança.
  const rows: Record<string, unknown>[] = [];
  for (let page = 1; rows.length < MAX_ROWS; page++) {
    const { rows: batch, total } = await fetchInvoices(supabase, organization.id, {
      ...filters,
      page,
    });

    for (const invoice of batch) {
      rows.push({
        Numero: invoice.numero ?? "",
        Fornecedor: invoice.suppliers?.nome ?? invoice.nome_extracted ?? "",
        NIF: invoice.suppliers?.nif ?? invoice.nif_extracted ?? "",
        Pais: invoice.pais ?? "",
        "Centro de custo": invoice.cost_centers?.nome ?? "",
        Estado: invoice.status,
        Pagamento: invoice.payment_status,
        Moeda: invoice.moeda,
        "Base tributavel": invoice.base_tributavel,
        IVA: invoice.iva_total,
        Total: invoice.total,
        "Total EUR": invoice.total_eur ?? "",
        "Data emissao": invoice.data_emissao ?? "",
        "Data vencimento": invoice.data_vencimento ?? "",
        Entrada: invoice.entrada_at,
        Origem: invoice.origin,
        Confianca: invoice.confidence_score ?? "",
        Ficheiro: invoice.storage_path ?? "",
      });
    }

    if (batch.length === 0 || rows.length >= total) break;
  }

  const csv = Papa.unparse(rows, { delimiter: ";" });
  const fileName = `faturas-${new Date().toISOString().slice(0, 10)}.csv`;

  // BOM para o Excel abrir os acentos corretamente.
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
