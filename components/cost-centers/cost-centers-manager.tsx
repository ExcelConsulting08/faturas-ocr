"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";

import {
  createCostCenter,
  createSupplierRule,
  deleteCostCenter,
  deleteSupplierRule,
} from "@/actions/cost-centers";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Input,
  Select,
} from "@faturas/ui";
import type { Supplier } from "@/types/domain";
import type { CostCenterWithCounts, RuleRow } from "@/app/(app)/centros-custo/page";

export function CostCentersManager({
  centers,
  rules,
  suppliers,
  readOnly,
}: {
  centers: CostCenterWithCounts[];
  rules: RuleRow[];
  suppliers: Supplier[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [centerId, setCenterId] = useState("");

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

  return (
    <div className="space-y-5">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <Card>
        <CardHeader className="flex items-center justify-between">
          <h2 className="font-medium">Centros de custo</h2>
        </CardHeader>

        {!readOnly ? (
          <CardBody className="border-b border-border">
            <form
              className="flex gap-2"
              action={(formData) =>
                run(async () => {
                  await createCostCenter(formData);
                  setNome("");
                })
              }
            >
              <Input
                name="nome"
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                placeholder="Nome do centro de custo"
                className="max-w-xs"
                required
              />
              <Button type="submit" variant="primary" disabled={pending}>
                <Plus className="h-4 w-4" />
                Criar centro de custo
              </Button>
            </form>
          </CardBody>
        ) : null}

        {centers.length === 0 ? (
          <EmptyState title="Ainda não há centros de custo" />
        ) : (
          <ul className="divide-y divide-border">
            {centers.map((center) => (
              <li key={center.id} className="flex items-center justify-between px-5 py-3">
                <Badge tone="amber" style={center.cor ? { color: center.cor } : undefined}>
                  {center.nome}
                </Badge>

                <div className="flex items-center gap-4 text-sm text-muted">
                  <span>{center.invoiceCount} faturas</span>
                  <span>{center.ruleCount} regras</span>
                  {!readOnly ? (
                    <button
                      className="text-muted transition-colors hover:text-red-600"
                      disabled={pending}
                      onClick={() => run(() => deleteCostCenter(center.id))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-medium">Regras automáticas</h2>
          <p className="text-sm text-muted">
            Faturas futuras deste fornecedor são classificadas automaticamente. Ao criar a regra, as
            faturas existentes ainda por classificar também são atualizadas.
          </p>
        </CardHeader>

        {!readOnly && suppliers.length > 0 && centers.length > 0 ? (
          <CardBody className="border-b border-border">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                <option value="">Escolher fornecedor</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.nome}
                  </option>
                ))}
              </Select>

              <span className="text-sm text-muted">→</span>

              <Select value={centerId} onChange={(event) => setCenterId(event.target.value)}>
                <option value="">Escolher centro de custo</option>
                {centers.map((center) => (
                  <option key={center.id} value={center.id}>
                    {center.nome}
                  </option>
                ))}
              </Select>

              <Button
                variant="primary"
                disabled={pending || !supplierId || !centerId}
                onClick={() =>
                  run(async () => {
                    await createSupplierRule(supplierId, centerId);
                    setSupplierId("");
                    setCenterId("");
                  })
                }
              >
                Criar regra
              </Button>
            </div>
          </CardBody>
        ) : null}

        {rules.length === 0 ? (
          <EmptyState title="Sem regras definidas" />
        ) : (
          <ul className="divide-y divide-border">
            {rules.map((rule) => (
              <li key={rule.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>
                  {rule.supplier?.nome ?? "—"}{" "}
                  <span className="text-muted">→ {rule.cost_center?.nome ?? "—"}</span>
                </span>
                {!readOnly ? (
                  <button
                    className="text-muted transition-colors hover:text-red-600"
                    disabled={pending}
                    onClick={() => run(() => deleteSupplierRule(rule.id))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
