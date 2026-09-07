import { Card } from "@/components/ui/primitives";
import { formatNumber } from "@/lib/utils";
import type { CurrencyTotal, InvoiceStats } from "@/lib/invoices/queries";

function StatCard({
  label,
  count,
  totals,
  accent,
}: {
  label: string;
  count: number;
  totals: CurrencyTotal[];
  accent?: string;
}) {
  return (
    <Card className="min-w-0 flex-1 p-3" style={accent ? { borderTopColor: accent, borderTopWidth: 2 } : undefined}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-lg font-semibold" style={accent ? { color: accent } : undefined}>
        {count}
      </p>
      <div className="mt-0.5 space-y-0.5">
        {totals.length === 0 ? (
          <p className="text-xs text-gray-400">—</p>
        ) : (
          totals.map((entry) => (
            <p key={entry.moeda} className="text-xs text-muted">
              {formatNumber(entry.total)} {entry.moeda}
            </p>
          ))
        )}
      </div>
    </Card>
  );
}

export function StatCards({ stats }: { stats: InvoiceStats }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <StatCard label="Total faturas" count={stats.totalCount} totals={stats.totals} />
      <StatCard label="Por rever" count={stats.porRever.count} totals={stats.porRever.totals} accent="#4f46e5" />
      <StatCard label="Confirmadas" count={stats.confirmadas.count} totals={stats.confirmadas.totals} accent="#10b981" />
      <StatCard label="Por pagar" count={stats.porPagar.count} totals={stats.porPagar.totals} accent="#f59e0b" />
      <StatCard label="Pagas" count={stats.pagas.count} totals={stats.pagas.totals} accent="#059669" />
    </div>
  );
}
