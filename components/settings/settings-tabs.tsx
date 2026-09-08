"use client";

import { useActionState, useState, useTransition } from "react";

import {
  changeOwnPassword,
  regenerateErpSecret,
  updateErpSettings,
  updateExtractionPreferences,
  updateOrganization,
  type SettingsState,
} from "@/actions/settings";
import { Button, Card, CardBody, CardHeader, Field, Input, Select } from "@faturas/ui";
import { cn } from "@/lib/utils";
import type { ErpIntegrationSettings, ExtractionPreferences, Organization } from "@/types/domain";

const INITIAL: SettingsState = {};

const TABS = [
  { id: "perfil", label: "Perfil" },
  { id: "organizacao", label: "Organização" },
  { id: "preferencias", label: "Preferências" },
  { id: "erp", label: "Integração ERP" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function Feedback({ state }: { state: SettingsState }) {
  if (state.error) return <p className="text-sm text-red-600">{state.error}</p>;
  if (state.success) return <p className="text-sm text-emerald-700">{state.success}</p>;
  return null;
}

export function SettingsTabs({
  organization,
  userEmail,
  preferences,
  erp,
  admin,
}: {
  organization: Organization;
  userEmail: string;
  preferences: ExtractionPreferences | null;
  erp: ErpIntegrationSettings | null;
  admin: boolean;
}) {
  const [tab, setTab] = useState<TabId>("perfil");

  const [passwordState, passwordAction, passwordPending] = useActionState(changeOwnPassword, INITIAL);
  const [orgState, orgAction, orgPending] = useActionState(updateOrganization, INITIAL);
  const [prefState, prefAction, prefPending] = useActionState(updateExtractionPreferences, INITIAL);
  const [erpState, erpAction, erpPending] = useActionState(updateErpSettings, INITIAL);
  const [regenerating, startRegenerate] = useTransition();

  return (
    <div className="flex gap-5">
      <nav className="w-44 shrink-0 space-y-1">
        {TABS.filter((entry) => admin || entry.id === "perfil").map((entry) => (
          <button
            key={entry.id}
            onClick={() => setTab(entry.id)}
            className={cn(
              "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors",
              tab === entry.id ? "bg-indigo-50 font-medium text-primary" : "hover:bg-gray-100",
            )}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <div className="min-w-0 flex-1">
        {tab === "perfil" ? (
          <Card>
            <CardHeader>
              <h2 className="font-medium">Perfil</h2>
            </CardHeader>
            <CardBody className="space-y-4">
              <Field label="Email">
                <Input value={userEmail} disabled />
              </Field>

              <form action={passwordAction} className="space-y-4 border-t border-border pt-4">
                <h3 className="font-medium">Alterar password</h3>

                <Field label="Nova password">
                  <Input name="password" type="password" minLength={8} required />
                </Field>

                <Field label="Confirmar nova password">
                  <Input name="confirm" type="password" minLength={8} required />
                </Field>

                <Feedback state={passwordState} />

                <Button type="submit" variant="primary" disabled={passwordPending}>
                  {passwordPending ? "A guardar..." : "Alterar password"}
                </Button>
              </form>
            </CardBody>
          </Card>
        ) : null}

        {tab === "organizacao" && admin ? (
          <Card>
            <CardHeader>
              <h2 className="font-medium">Organização</h2>
            </CardHeader>
            <CardBody>
              <form action={orgAction} className="space-y-4">
                <Field label="Nome">
                  <Input name="nome" defaultValue={organization.nome} required />
                </Field>

                <Field label="NIF">
                  <Input name="nif" defaultValue={organization.nif} required />
                </Field>

                <Feedback state={orgState} />

                <Button type="submit" variant="primary" disabled={orgPending}>
                  {orgPending ? "A guardar..." : "Guardar"}
                </Button>
              </form>

              <p className="mt-4 border-t border-border pt-4 text-sm text-muted">
                As faturas recebidas por email chegam através das caixas por país, geridas na página{" "}
                <a href="/mailboxes" className="text-primary hover:underline">
                  Mailboxes
                </a>
                .
              </p>
            </CardBody>
          </Card>
        ) : null}

        {tab === "preferencias" && admin ? (
          <Card>
            <CardHeader>
              <h2 className="font-medium">Preferências de extração</h2>
            </CardHeader>
            <CardBody>
              <form action={prefAction} className="space-y-4">
                <Field label="Modo de confiança">
                  <Select name="modo" defaultValue={preferences?.modo ?? "automatico"} className="w-full">
                    <option value="automatico">Automático</option>
                    <option value="semi_automatico">Semi-automático</option>
                    <option value="manual">Manual</option>
                  </Select>
                </Field>

                <p className="text-sm text-muted">
                  Automático: confirma sozinho acima do limiar alto. Semi-automático: nunca confirma
                  sozinho, mas usa os limiares para priorizar a revisão. Manual: tudo passa por revisão.
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Limiar alto">
                    <Input
                      name="limiar_alto"
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      defaultValue={preferences?.limiar_alto ?? 0.9}
                    />
                  </Field>

                  <Field label="Limiar baixo">
                    <Input
                      name="limiar_baixo"
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      defaultValue={preferences?.limiar_baixo ?? 0.6}
                    />
                  </Field>
                </div>

                <p className="text-sm text-muted">
                  Abaixo do limiar baixo a fatura é marcada como falhada e fica a aguardar correção
                  manual.
                </p>

                <Feedback state={prefState} />

                <Button type="submit" variant="primary" disabled={prefPending}>
                  {prefPending ? "A guardar..." : "Guardar"}
                </Button>
              </form>
            </CardBody>
          </Card>
        ) : null}

        {tab === "erp" && admin ? (
          <Card>
            <CardHeader>
              <h2 className="font-medium">Integração ERP</h2>
              <p className="text-sm text-muted">
                Envia as faturas confirmadas para o seu ERP, ou envia manualmente a partir do ecrã de
                cada fatura.
              </p>
            </CardHeader>
            <CardBody className="space-y-4">
              <form action={erpAction} className="space-y-4">
                <Field label="URL do webhook">
                  <Input
                    name="webhook_url"
                    type="url"
                    defaultValue={erp?.webhook_url ?? ""}
                    placeholder="https://exemplo.com/webhooks/faturas"
                  />
                </Field>

                <label className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <input
                    type="checkbox"
                    name="envio_automatico"
                    defaultChecked={erp?.envio_automatico ?? false}
                    className="mt-0.5"
                  />
                  <span className="text-sm">
                    <span className="font-medium">Envio automático</span>
                    <span className="block text-muted">
                      Envia sempre que uma fatura fica confirmada.
                    </span>
                  </span>
                </label>

                <Feedback state={erpState} />

                <Button type="submit" variant="primary" disabled={erpPending}>
                  {erpPending ? "A guardar..." : "Guardar"}
                </Button>
              </form>

              <div className="space-y-2 border-t border-border pt-4">
                <Field label="Segredo">
                  <Input value={erp?.secret ?? "Ainda não gerado"} readOnly className="font-mono text-xs" />
                </Field>

                <p className="text-sm text-muted">
                  Cada envio inclui o cabeçalho <code className="font-mono">X-Faturas-Signature</code> —
                  HMAC-SHA256 do corpo do pedido usando este segredo, para o seu sistema confirmar a
                  origem.
                </p>

                <Button
                  disabled={regenerating}
                  onClick={() => startRegenerate(() => regenerateErpSecret())}
                >
                  {regenerating ? "A gerar..." : "Gerar novo segredo"}
                </Button>
              </div>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
