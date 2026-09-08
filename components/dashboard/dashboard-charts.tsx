"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import { Card, CardBody, CardHeader } from "@faturas/ui";
import { formatNumber } from "@/lib/utils";

export interface GroupEntry {
  nome: string;
  count: number;
  total: number;
}

/** Lista com barra de progresso proporcional ao maior valor do grupo. */
function ProgressList({
  entries,
  valueOf,
  format,
}: {
  entries: GroupEntry[];
  valueOf: (entry: GroupEntry) => number;
  format: (entry: GroupEntry) => string;
}) {
  const max = Math.max(...entries.map(valueOf), 1);

  if (entries.length === 0) {
    return <p className="text-sm text-muted">Sem dados</p>;
  }

  return (
    <ul className="space-y-2.5">
      {entries.slice(0, 8).map((entry) => (
        <li key={entry.nome} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="truncate">{entry.nome}</span>
            <span className="ml-3 shrink-0 text-muted">{format(entry)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100">
            <div
              className="h-1.5 rounded-full bg-primary"
              style={{ width: `${(valueOf(entry) / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DashboardCharts({
  gastosPorMes,
  estados,
  centros,
  paises,
  pagamento,
  iva,
}: {
  gastosPorMes: { mes: string; total: number }[];
  estados: GroupEntry[];
  centros: GroupEntry[];
  paises: GroupEntry[];
  pagamento: GroupEntry[];
  iva: { base: number; iva: number };
}) {
  const ivaPercent = iva.base + iva.iva > 0 ? (iva.iva / (iva.base + iva.iva)) * 100 : 0;

  return (
    <div className="grid gap-1.5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="flex items-baseline justify-between">
          <h2 className="font-medium">Gastos por mês</h2>
          <span className="text-xs text-muted">Valores convertidos a EUR</span>
        </CardHeader>
        <CardBody className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={gastosPorMes}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f3" />
              <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(value) => [`${formatNumber(Number(value))} EUR`, "Total"]}
                contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }}
              />
              <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-medium">Distribuição por estado</h2>
        </CardHeader>
        <CardBody>
          <ProgressList
            entries={estados}
            valueOf={(entry) => entry.count}
            format={(entry) => String(entry.count)}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-medium">Centros de custo por valor</h2>
        </CardHeader>
        <CardBody>
          <ProgressList
            entries={centros}
            valueOf={(entry) => entry.total}
            format={(entry) => `${formatNumber(entry.total)} €`}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-medium">Gastos por país</h2>
        </CardHeader>
        <CardBody>
          <ProgressList
            entries={paises}
            valueOf={(entry) => entry.total}
            format={(entry) => `${formatNumber(entry.total)} €`}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-medium">Pagamento</h2>
        </CardHeader>
        <CardBody>
          <ProgressList
            entries={pagamento}
            valueOf={(entry) => entry.count}
            format={(entry) => String(entry.count)}
          />
        </CardBody>
      </Card>

      <Card className="lg:col-span-3">
        <CardHeader>
          <h2 className="font-medium">IVA</h2>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted">Base tributável</p>
            <p className="text-lg font-medium">{formatNumber(iva.base)} EUR</p>
          </div>
          <div>
            <p className="text-sm text-muted">IVA</p>
            <p className="text-lg font-medium">{formatNumber(iva.iva)} EUR</p>
          </div>
          <div>
            <p className="text-sm text-muted">IVA em % do total</p>
            <p className="text-lg font-medium">{ivaPercent.toFixed(1)}%</p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
