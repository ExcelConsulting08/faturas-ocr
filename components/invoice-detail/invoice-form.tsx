"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Check, Plus, Send, Trash2, X } from "lucide-react";

import {
  confirmInvoice,
  discardInvoice,
  saveInvoice,
  sendToErp,
  setPaymentStatus,
  type InvoiceFormValues,
} from "@/actions/invoices";
import { ConfidenceBadge, PaymentBadge, StatusBadge } from "@/components/invoices/status-badges";
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Select } from "@/components/ui/primitives";
import { formatNumber } from "@/lib/utils";
import type { CostCenter, InvoiceWithRelations } from "@/types/domain";

interface LineDraft {
  key: string;
  descricao: string;
  quantidade: string;
  preco_unitario: string;
  iva_percentagem: string;
  desconto: string;
  outro_imposto: string;
}

function toDraft(invoice: InvoiceWithRelations): LineDraft[] {
  return invoice.line_items.map((line, index) => ({
    key: `${line.id}-${index}`,
    descricao: line.descricao ?? "",
    quantidade: String(line.quantidade),
    preco_unitario: String(line.preco_unitario),
    iva_percentagem: String(line.iva_percentagem),
    desconto: String(line.desconto),
    outro_imposto: String(line.outro_imposto),
  }));
}

function num(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function InvoiceForm({
  invoice,
  costCenters,
  paises,
  readOnly,
}: {
  invoice: InvoiceWithRelations;
  costCenters: CostCenter[];
  paises: string[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [numero, setNumero] = useState(invoice.numero ?? "");
  const [moeda, setMoeda] = useState(invoice.moeda);
  const [dataEmissao, setDataEmissao] = useState(invoice.data_emissao ?? "");
  const [dataVencimento, setDataVencimento] = useState(invoice.data_vencimento ?? "");
  const [pais, setPais] = useState(invoice.pais ?? "");
  const [fornecedorNome, setFornecedorNome] = useState(
    invoice.supplier?.nome ?? invoice.nome_extracted ?? "",
  );
  const [fornecedorNif, setFornecedorNif] = useState(
    invoice.supplier?.nif ?? invoice.nif_extracted ?? "",
  );
  const [fornecedorIban, setFornecedorIban] = useState(
    invoice.supplier?.iban ?? invoice.iban_extracted ?? "",
  );
  const [costCenterId, setCostCenterId] = useState(invoice.cost_center_id ?? "");
  const [linhas, setLinhas] = useState<LineDraft[]>(toDraft(invoice));

  const totals = useMemo(() => {
    const base = linhas.reduce(
      (sum, line) => sum + num(line.quantidade) * num(line.preco_unitario) - num(line.desconto),
      0,
    );
    const iva = linhas.reduce((sum, line) => {
      const bruto = num(line.quantidade) * num(line.preco_unitario) - num(line.desconto);
      return sum + (bruto * num(line.iva_percentagem)) / 100 + num(line.outro_imposto);
    }, 0);
    return { base, iva, total: base + iva };
  }, [linhas]);

  const flags = invoice.validation_flags ?? {};

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ocorreu um erro");
      }
    });
  }

  function handleSave() {
    const values: InvoiceFormValues = {
      numero: numero || null,
      moeda,
      data_emissao: dataEmissao || null,
      data_vencimento: dataVencimento || null,
      pais: pais || null,
      fornecedor_nome: fornecedorNome || null,
      fornecedor_nif: fornecedorNif || null,
      fornecedor_iban: fornecedorIban || null,
      cost_center_id: costCenterId || null,
      linhas: linhas.map((line) => ({
        descricao: line.descricao || null,
        quantidade: num(line.quantidade),
        preco_unitario: num(line.preco_unitario),
        iva_percentagem: num(line.iva_percentagem),
        desconto: num(line.desconto),
        outro_imposto: num(line.outro_imposto),
      })),
    };

    run(() => saveInvoice(invoice.id, values));
  }

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLinhas((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-5 py-3">
        <StatusBadge status={invoice.status} />
        <PaymentBadge status={invoice.payment_status} />
        <ConfidenceBadge score={invoice.confidence_score} />
        {invoice.is_possible_duplicate ? <Badge tone="amber">Possível duplicado</Badge> : null}

        {!readOnly ? (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button disabled={pending} onClick={handleSave}>
              Guardar
            </Button>
            <Button
              variant="warning"
              disabled={pending}
              onClick={() =>
                run(() =>
                  setPaymentStatus(
                    invoice.id,
                    invoice.payment_status === "paga" ? "por_pagar" : "paga",
                  ),
                )
              }
            >
              {invoice.payment_status === "paga" ? "Marcar como não paga" : "Marcar como paga"}
            </Button>
            <Button variant="primary" disabled={pending} onClick={() => run(() => confirmInvoice(invoice.id))}>
              <Check className="h-4 w-4" />
              Confirmar
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const result = await sendToErp(invoice.id);
                  setNotice(result.message);
                })
              }
            >
              <Send className="h-4 w-4" />
              Enviar para ERP
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  await discardInvoice(invoice.id);
                  router.push("/invoices");
                })
              }
            >
              <X className="h-4 w-4" />
              Descartar
            </Button>
          </div>
        ) : null}
      </div>

      {error ? <p className="px-5 py-2 text-sm text-red-600">{error}</p> : null}
      {notice ? <p className="px-5 py-2 text-sm text-sky-800">{notice}</p> : null}
      {invoice.extraction_error ? (
        <p className="border-b border-red-200 bg-red-50 px-5 py-2 text-sm text-red-700">
          Erro na extração: {invoice.extraction_error}
        </p>
      ) : null}

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <Card>
          <CardHeader>
            <h2 className="font-medium">Fornecedor</h2>
          </CardHeader>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome">
              <Input value={fornecedorNome} disabled={readOnly} onChange={(e) => setFornecedorNome(e.target.value)} />
            </Field>

            <Field
              label="NIF"
              hint={
                flags.nif_valid === true ? (
                  <span className="text-xs text-emerald-600">✓ NIF português válido</span>
                ) : flags.nif_valid === false ? (
                  <span className="text-xs text-amber-600">NIF não validado</span>
                ) : null
              }
            >
              <Input value={fornecedorNif} disabled={readOnly} onChange={(e) => setFornecedorNif(e.target.value)} />
            </Field>

            <Field
              label="IBAN"
              hint={
                flags.iban_valid === false ? (
                  <span className="text-xs text-amber-600">IBAN inválido</span>
                ) : null
              }
            >
              <Input value={fornecedorIban} disabled={readOnly} onChange={(e) => setFornecedorIban(e.target.value)} />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-medium">Fatura</h2>
          </CardHeader>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Número">
              <Input value={numero} disabled={readOnly} onChange={(e) => setNumero(e.target.value)} />
            </Field>

            <Field label="Moeda">
              <Input value={moeda} disabled={readOnly} onChange={(e) => setMoeda(e.target.value.toUpperCase())} />
            </Field>

            <Field
              label="Data emissão"
              hint={
                flags.dates_valid === true ? (
                  <span className="text-xs text-emerald-600">✓ Datas válidas</span>
                ) : flags.dates_valid === false ? (
                  <span className="text-xs text-amber-600">Datas suspeitas</span>
                ) : null
              }
            >
              <Input
                type="date"
                value={dataEmissao}
                disabled={readOnly}
                onChange={(e) => setDataEmissao(e.target.value)}
              />
            </Field>

            <Field label="Data vencimento">
              <Input
                type="date"
                value={dataVencimento}
                disabled={readOnly}
                onChange={(e) => setDataVencimento(e.target.value)}
              />
            </Field>

            <Field label="País">
              <Select
                value={pais}
                disabled={readOnly}
                className="w-full"
                onChange={(e) => setPais(e.target.value)}
              >
                <option value="">Sem país</option>
                {paises.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Centro de custo">
              <Select
                value={costCenterId}
                disabled={readOnly}
                className="w-full"
                onChange={(e) => setCostCenterId(e.target.value)}
              >
                <option value="">Sem centro de custo</option>
                {costCenters.map((center) => (
                  <option key={center.id} value={center.id}>
                    {center.nome}
                  </option>
                ))}
              </Select>
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-medium">Valores</h2>
            <p className="text-sm text-muted">Calculado automaticamente a partir das linhas abaixo</p>
          </CardHeader>
          <CardBody className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted">Base tributável</p>
              <p className="text-lg font-medium">{formatNumber(totals.base)}</p>
            </div>
            <div>
              <p className="text-sm text-muted">IVA</p>
              <p className="text-lg font-medium">{formatNumber(totals.iva)}</p>
            </div>
            <div>
              <p className="text-sm text-muted">Total</p>
              <p className="text-lg font-semibold">{formatNumber(totals.total)}</p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="font-medium">Linhas</h2>
            {!readOnly ? (
              <Button
                onClick={() =>
                  setLinhas((current) => [
                    ...current,
                    {
                      key: `nova-${current.length}-${Date.now()}`,
                      descricao: "",
                      quantidade: "1",
                      preco_unitario: "0",
                      iva_percentagem: "23",
                      desconto: "0",
                      outro_imposto: "0",
                    },
                  ])
                }
              >
                <Plus className="h-4 w-4" />
                Adicionar linha
              </Button>
            ) : null}
          </CardHeader>

          <div className="thin-scroll overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Descrição</th>
                  <th className="px-3 py-2 font-medium">Qtd</th>
                  <th className="px-3 py-2 font-medium">P. Unit</th>
                  <th className="px-3 py-2 font-medium">IVA %</th>
                  <th className="px-3 py-2 font-medium">Desconto</th>
                  <th className="px-3 py-2 font-medium">Outros</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  {!readOnly ? <th className="w-10" /> : null}
                </tr>
              </thead>

              <tbody className="divide-y divide-border">
                {linhas.map((line, index) => {
                  const lineTotal =
                    num(line.quantidade) * num(line.preco_unitario) - num(line.desconto);

                  return (
                    <tr key={line.key}>
                      <td className="px-4 py-2">
                        <Input
                          value={line.descricao}
                          disabled={readOnly}
                          className="min-w-[220px]"
                          onChange={(e) => updateLine(index, { descricao: e.target.value })}
                        />
                      </td>
                      {(
                        [
                          "quantidade",
                          "preco_unitario",
                          "iva_percentagem",
                          "desconto",
                          "outro_imposto",
                        ] as const
                      ).map((field) => (
                        <td key={field} className="px-3 py-2">
                          <Input
                            value={line[field]}
                            disabled={readOnly}
                            inputMode="decimal"
                            className="w-24"
                            onChange={(e) => updateLine(index, { [field]: e.target.value })}
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-medium">{formatNumber(lineTotal)}</td>
                      {!readOnly ? (
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            className="text-muted transition-colors hover:text-red-600"
                            onClick={() =>
                              setLinhas((current) => current.filter((_, i) => i !== index))
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
