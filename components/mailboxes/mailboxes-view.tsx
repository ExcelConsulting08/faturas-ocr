"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { Inbox, Pencil, Play, Plus, RefreshCw, Square, Trash2, Upload } from "lucide-react";

import {
  collectNow,
  createMailbox,
  deleteMailbox,
  setCollectionLoop,
  setMailboxActive,
  syncAccount,
  updateMailbox,
  type MailboxState,
} from "@/actions/mailboxes";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Select,
} from "@/components/ui/primitives";
import { formatDateTime } from "@/lib/utils";
import type { CollectionRun, CollectionSettings } from "@/types/domain";
import type { MailboxWithCount } from "@/app/(app)/mailboxes/page";

const INITIAL: MailboxState = {};
const INTERVALS = [30, 60, 120, 300, 900];

interface MailboxValues {
  pais: string;
  empresa: string;
  idioma: string;
  email_address: string;
}

/** Edição de uma caixa, no lugar do próprio cartão. */
function MailboxEditor({
  mailbox,
  disabled,
  onSave,
  onCancel,
}: {
  mailbox: MailboxWithCount;
  disabled: boolean;
  onSave: (values: MailboxValues) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<MailboxValues>({
    pais: mailbox.pais,
    empresa: mailbox.empresa,
    idioma: mailbox.idioma,
    email_address: mailbox.email_address,
  });

  function set(campo: keyof MailboxValues, valor: string) {
    setValues((atual) => ({ ...atual, [campo]: valor }));
  }

  return (
    <Card className="border-primary p-4">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(values);
        }}
      >
        <Field label="Endereço de email">
          <Input
            type="email"
            value={values.email_address}
            disabled={disabled}
            required
            onChange={(e) => set("email_address", e.target.value)}
          />
        </Field>

        <Field label="País">
          <Input
            value={values.pais}
            maxLength={2}
            disabled={disabled}
            required
            onChange={(e) => set("pais", e.target.value.toUpperCase())}
          />
        </Field>

        <Field label="Empresa">
          <Input
            value={values.empresa}
            disabled={disabled}
            required
            onChange={(e) => set("empresa", e.target.value)}
          />
        </Field>

        <Field label="Idioma">
          <Input
            value={values.idioma}
            disabled={disabled}
            onChange={(e) => set("idioma", e.target.value)}
          />
        </Field>

        <div className="flex gap-2 border-t border-border pt-3">
          <Button type="submit" variant="primary" className="text-xs" disabled={disabled}>
            {disabled ? "A gravar..." : "Gravar"}
          </Button>
          <Button type="button" className="text-xs" disabled={disabled} onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function MailboxesView({
  mailboxes,
  settings,
  lastRun,
  totalInSystem,
  extractionReady,
  missingGraphVars,
  storageName,
}: {
  mailboxes: MailboxWithCount[];
  settings: CollectionSettings | null;
  lastRun: CollectionRun | null;
  totalInSystem: number;
  extractionReady: boolean;
  missingGraphVars: string[];
  storageName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [formState, formAction, formPending] = useActionState(createMailbox, INITIAL);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionCollected, setSessionCollected] = useState(0);
  const [intervalo, setIntervalo] = useState(settings?.intervalo_segundos ?? 60);
  const [editando, setEditando] = useState<string | null>(null);

  const loopAtivo = settings?.loop_ativo ?? false;
  const graphConnected = missingGraphVars.length === 0;
  const idiomas = new Set(mailboxes.map((m) => m.idioma)).size;

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
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Mailboxes</h1>
        <p className="text-sm text-muted">
          Uma caixa por país: {mailboxes.length}{" "}
          {mailboxes.length === 1 ? "país" : "países"}, {idiomas}{" "}
          {idiomas === 1 ? "idioma" : "idiomas"}, fluxos independentes. A caixa determina o país.
        </p>
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Inbox className="mt-0.5 h-5 w-5 text-muted" />
            <div>
              <p className="font-medium">
                {graphConnected ? "Conta ligada" : "Nenhuma caixa ligada"}
              </p>
              <p className="text-sm text-muted">
                {graphConnected
                  ? "Autenticação no Microsoft Graph configurada."
                  : `${missingGraphVars.join(" e ")} em falta no .env.local.`}
              </p>
              <p className="text-sm text-muted">Documentos guardados em: {storageName}.</p>
            </div>
          </div>

          <Button
            disabled={pending || !graphConnected}
            onClick={() =>
              run(async () => {
                const result = await syncAccount();
                setFeedback(
                  result.erros.length > 0
                    ? `${result.ligadas} caixas ligadas. Erros: ${result.erros.join("; ")}`
                    : `${result.ligadas} caixas ligadas com sucesso.`,
                );
              })
            }
          >
            <Upload className="h-4 w-4" />
            Sincronizar conta
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  loopAtivo ? "bg-emerald-500" : "bg-gray-300"
                }`}
              />
              <div>
                <p className="font-medium">{loopAtivo ? "Recolha ativa" : "Recolha parada"}</p>
                <p className="text-sm text-muted">
                  {loopAtivo
                    ? `O agendador recolhe a cada ${intervalo}s.`
                    : "Inicie o loop para recolher continuamente"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted">Intervalo</span>
              <Select
                value={intervalo}
                disabled={pending}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setIntervalo(value);
                  run(() => setCollectionLoop(loopAtivo, value));
                }}
              >
                {INTERVALS.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds}s
                  </option>
                ))}
              </Select>

              <Button
                disabled={pending || mailboxes.length === 0}
                onClick={() =>
                  run(async () => {
                    const result = await collectNow();
                    setSessionCollected((current) => current + result.created);
                    setFeedback(
                      result.errors.length > 0
                        ? `${result.created} faturas recolhidas. Erros: ${result.errors.join("; ")}`
                        : `${result.created} faturas recolhidas, ${result.skipped} ignoradas.`,
                    );
                  })
                }
              >
                <RefreshCw className="h-4 w-4" />
                Recolher agora
              </Button>

              <Button
                variant={loopAtivo ? "danger" : "primary"}
                disabled={pending}
                onClick={() => run(() => setCollectionLoop(!loopAtivo, intervalo))}
              >
                {loopAtivo ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {loopAtivo ? "Parar loop" : "Iniciar loop"}
              </Button>
            </div>
          </div>

          <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-4">
            <div>
              <p className="text-sm text-muted">Motor de extração</p>
              <p className={`mt-1 text-lg font-semibold ${extractionReady ? "" : "text-amber-600"}`}>
                {extractionReady ? "Ligado" : "Modo simulado"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted">Recolhidas nesta sessão</p>
              <p className="mt-1 text-lg font-semibold">{sessionCollected}</p>
            </div>
            <div>
              <p className="text-sm text-muted">Último lote</p>
              <p className="mt-1 text-lg font-semibold">
                {lastRun ? `${lastRun.invoices_created}` : "—"}
              </p>
              {lastRun ? (
                <p className="text-xs text-muted">{formatDateTime(lastRun.started_at)}</p>
              ) : null}
            </div>
            <div>
              <p className="text-sm text-muted">Total no sistema</p>
              <p className="mt-1 text-lg font-semibold">{totalInSystem}</p>
            </div>
          </div>
        </CardBody>
      </Card>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {feedback ? (
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">{feedback}</p>
      ) : null}

      <div className="flex items-center justify-between">
        <h2 className="font-medium">Caixas monitorizadas (uma por país)</h2>
        <Button variant="primary" onClick={() => setShowForm((open) => !open)}>
          <Plus className="h-4 w-4" />
          Adicionar caixa
        </Button>
      </div>

      {showForm ? (
        <Card>
          <CardHeader>
            <h3 className="font-medium">Nova caixa de país</h3>
          </CardHeader>
          <CardBody>
            <form action={formAction} className="grid gap-4 sm:grid-cols-2">
              <Field label="País (código de 2 letras)">
                <Input name="pais" maxLength={2} placeholder="PT" required />
              </Field>
              <Field label="Empresa">
                <Input name="empresa" placeholder="Empresa Portugal, Lda." required />
              </Field>
              <Field label="Idioma">
                <Input name="idioma" placeholder="Português" />
              </Field>
              <Field label="Endereço de email">
                <Input name="email_address" type="email" placeholder="faturas@empresa.pt" required />
              </Field>

              <div className="sm:col-span-2">
                {formState.error ? <p className="text-sm text-red-600">{formState.error}</p> : null}
                {formState.success ? (
                  <p className="text-sm text-emerald-700">{formState.success}</p>
                ) : null}
              </div>

              <div className="sm:col-span-2">
                <Button type="submit" variant="primary" disabled={formPending}>
                  {formPending ? "A adicionar..." : "Adicionar caixa"}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      ) : null}

      {mailboxes.length === 0 ? (
        <Card>
          <EmptyState
            title="Sem caixas configuradas"
            description="Adicione uma caixa por país para começar a recolher faturas automaticamente."
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {mailboxes.map((mailbox) =>
            editando === mailbox.id ? (
              <MailboxEditor
                key={mailbox.id}
                mailbox={mailbox}
                disabled={pending}
                onCancel={() => setEditando(null)}
                onSave={(values) =>
                  run(async () => {
                    await updateMailbox(mailbox.id, values);
                    setEditando(null);
                  })
                }
              />
            ) : (
              <Card key={mailbox.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Inbox className="h-4 w-4 shrink-0 text-muted" />
                    <span className="truncate font-medium">{mailbox.email_address}</span>
                  </div>
                  <Badge tone="sky">{mailbox.pais}</Badge>
                </div>

                <p className="mt-2 truncate text-sm text-muted">{mailbox.empresa}</p>
                <p className="text-sm text-muted">Idioma: {mailbox.idioma}</p>

                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-2xl font-semibold">{mailbox.invoiceCount}</p>
                    <p className="text-sm text-muted">faturas recolhidas</p>
                  </div>

                  {!mailbox.ativo ? (
                    <Badge tone="neutral">Inativa</Badge>
                  ) : mailbox.connection_status === "ligada" ? (
                    <Badge tone="green">Ligada</Badge>
                  ) : mailbox.connection_status === "erro" ? (
                    <Badge tone="red">Erro</Badge>
                  ) : (
                    <Badge tone="neutral">Por ligar</Badge>
                  )}
                </div>

                {mailbox.last_error ? (
                  <p className="mt-2 line-clamp-2 text-xs text-red-600">{mailbox.last_error}</p>
                ) : null}
                {mailbox.last_polled_at ? (
                  <p className="mt-1 text-xs text-gray-400">
                    Última recolha: {formatDateTime(mailbox.last_polled_at)}
                  </p>
                ) : null}

                <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                  <Button
                    className="text-xs"
                    disabled={pending}
                    onClick={() => {
                      setError(null);
                      setEditando(mailbox.id);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </Button>
                  <Button
                    className="text-xs"
                    disabled={pending}
                    onClick={() => run(() => setMailboxActive(mailbox.id, !mailbox.ativo))}
                  >
                    {mailbox.ativo ? "Desativar" : "Ativar"}
                  </Button>
                  <button
                    className="ml-auto text-muted transition-colors hover:text-red-600"
                    disabled={pending}
                    onClick={() => run(() => deleteMailbox(mailbox.id))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            ),
          )}
        </div>
      )}

      <Card className="border-sky-200 bg-sky-50">
        <CardBody className="text-sm text-sky-900">
          <span className="font-medium">Como funciona:</span> cada fatura que chega a uma destas
          caixas é recolhida, o documento é lido por OCR, são extraídos o NIF, o nome do fornecedor,
          as datas, as linhas e os totais, e a fatura é classificada pelo país da caixa e pelo centro
          de custo do fornecedor. Entra depois no fluxo de revisão e confirmação, exatamente como uma
          fatura carregada manualmente.{" "}
          {extractionReady
            ? "O motor de extração está ligado: a leitura é feita sobre o documento real."
            : "O motor de extração está desligado (GEMINI_API_KEY em falta): a leitura corre em modo simulado, com dados fictícios."}
        </CardBody>
      </Card>
    </div>
  );
}
