import Link from "next/link";

import { Badge, Card, EmptyState } from "@faturas/ui";
import { CountryBadge, PaymentBadge, StatusBadge } from "@/components/invoices/status-badges";
import type { InvoiceListRow } from "@/lib/invoices/queries";
import { avatarColor, formatDate, formatNumber, initials } from "@/lib/utils";

export function InvoiceTable({ rows }: { rows: InvoiceListRow[] }) {
  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Sem faturas"
          description="Carregue faturas ou aguarde a recolha automática das caixas de email."
        />
      </Card>
    );
  }

  return (
    <Card>
      <div className="thin-scroll overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Moeda</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Fornecedor</th>
              <th className="px-4 py-3 font-medium">Centro de Custo</th>
              <th className="px-4 py-3 font-medium">Número</th>
              <th className="px-4 py-3 font-medium">Doc.</th>
              <th className="px-4 py-3 font-medium">Venc.</th>
              <th className="px-4 py-3 font-medium">Entrada</th>
              <th className="px-4 py-3 font-medium">País</th>
              <th className="px-4 py-3 font-medium">Pagamento</th>
              <th className="px-4 py-3 font-medium">Origem</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-border">
            {rows.map((row) => {
              const fornecedor = row.suppliers?.nome ?? row.nome_extracted;

              return (
                <tr key={row.id} className="transition-colors hover:bg-gray-50">
                  <td className="px-4 py-3 text-right font-medium">
                    <Link href={`/invoices/${row.id}`} className="block">
                      {formatNumber(Number(row.total))}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{row.moeda}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/invoices/${row.id}`} className="flex items-center gap-2">
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarColor(
                          fornecedor ?? "?",
                        )}`}
                      >
                        {initials(fornecedor)}
                      </span>
                      <span className="max-w-[180px] truncate">{fornecedor ?? "—"}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {row.cost_centers ? (
                      <Badge tone="amber">{row.cost_centers.nome}</Badge>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="max-w-[160px] truncate">{row.numero ?? "—"}</span>
                      {row.is_possible_duplicate ? <Badge tone="amber">DUP</Badge> : null}
                      {row.is_credit_note ? <Badge tone="neutral">NC</Badge> : null}
                      {row.source_group_id ? (
                        <Badge
                          tone="sky"
                          title={`Uma de ${row.source_invoice_count ?? "várias"} faturas do mesmo documento${
                            row.source_pages ? `, páginas ${row.source_pages}` : ""
                          }`}
                        >
                          LOTE
                        </Badge>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted">{formatDate(row.data_emissao)}</td>
                  <td className="px-4 py-3 text-muted">{formatDate(row.data_vencimento)}</td>
                  <td className="px-4 py-3 text-muted">{formatDate(row.entrada_at)}</td>
                  <td className="px-4 py-3">
                    <CountryBadge pais={row.pais} />
                  </td>
                  <td className="px-4 py-3">
                    <PaymentBadge status={row.payment_status} />
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {row.origin === "email" ? "Email" : "Upload"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
