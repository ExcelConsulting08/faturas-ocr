"use client";

import { useActionState, useState, useTransition } from "react";
import { KeyRound, UserPlus } from "lucide-react";

import {
  createUser,
  resetMemberPassword,
  setMemberStatus,
  updateMemberRole,
  type UserActionState,
} from "@/actions/users";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Select,
} from "@faturas/ui";
import { formatDate } from "@/lib/utils";
import type { OrgMember, Role } from "@/types/domain";

interface MemberRow extends OrgMember {
  email: string;
}

const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrador",
  membro: "Membro",
  leitor: "Leitor",
};

const INITIAL: UserActionState = {};

export function UsersManager({
  members,
  currentMemberId,
}: {
  members: MemberRow[];
  currentMemberId: string;
}) {
  const [showForm, setShowForm] = useState(false);
  const [state, formAction, pending] = useActionState(createUser, INITIAL);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<void>) {
    setError(null);
    setFeedback(null);
    startTransition(async () => {
      try {
        await action();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ocorreu um erro");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => setShowForm((open) => !open)}>
          <UserPlus className="h-4 w-4" />
          Novo utilizador
        </Button>
      </div>

      {showForm ? (
        <Card>
          <CardHeader>
            <h2 className="font-medium">Criar utilizador</h2>
          </CardHeader>
          <CardBody>
            <form action={formAction} className="grid gap-4 sm:grid-cols-2">
              <Field label="Email">
                <Input name="email" type="email" required />
              </Field>

              <Field label="Nome">
                <Input name="nome" />
              </Field>

              <Field label="Papel">
                <Select name="role" defaultValue="membro" className="w-full">
                  <option value="admin">Administrador — gere tudo</option>
                  <option value="membro">Membro — carrega e confirma faturas</option>
                  <option value="leitor">Leitor — apenas consulta</option>
                </Select>
              </Field>

              <Field label="Método de acesso">
                <Select name="metodo" defaultValue="convite" className="w-full">
                  <option value="convite">Convite por email</option>
                  <option value="password">Password temporária</option>
                </Select>
              </Field>

              <div className="sm:col-span-2">
                {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
                {state.success ? <p className="text-sm text-emerald-700">{state.success}</p> : null}
                {state.temporaryPassword ? (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    Password temporária: <code className="font-mono">{state.temporaryPassword}</code>
                    <br />
                    Guarde-a agora — não voltará a ser mostrada. O utilizador terá de a alterar no
                    primeiro acesso.
                  </p>
                ) : null}
              </div>

              <div className="sm:col-span-2">
                <Button type="submit" variant="primary" disabled={pending}>
                  {pending ? "A criar..." : "Criar utilizador"}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {feedback ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{feedback}</p>
      ) : null}

      <Card>
        <div className="overflow-x-auto thin-scroll">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">Utilizador</th>
                <th className="px-5 py-3 font-medium">Papel</th>
                <th className="px-5 py-3 font-medium">Estado</th>
                <th className="px-5 py-3 font-medium">Desde</th>
                <th className="px-5 py-3 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.map((row) => {
                const isSelf = row.id === currentMemberId;

                return (
                  <tr key={row.id}>
                    <td className="px-5 py-3">
                      <div className="font-medium">{row.nome ?? "—"}</div>
                      <div className="text-xs text-muted">{row.email}</div>
                    </td>

                    <td className="px-5 py-3">
                      <Select
                        value={row.role}
                        disabled={isPending}
                        onChange={(event) =>
                          run(() => updateMemberRole(row.id, event.target.value as Role))
                        }
                      >
                        {(Object.keys(ROLE_LABELS) as Role[]).map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </Select>
                    </td>

                    <td className="px-5 py-3">
                      {row.status === "ativo" ? (
                        <Badge tone="green">Ativo</Badge>
                      ) : (
                        <Badge tone="neutral">Inativo</Badge>
                      )}
                    </td>

                    <td className="px-5 py-3 text-muted">{formatDate(row.created_at)}</td>

                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Button
                          disabled={isPending}
                          onClick={() =>
                            run(async () => {
                              const password = await resetMemberPassword(row.id);
                              setFeedback(
                                `Nova password de ${row.email}: ${password} — guarde-a agora, não será mostrada novamente.`,
                              );
                            })
                          }
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          Repor password
                        </Button>

                        {row.status === "ativo" ? (
                          <Button
                            variant="danger"
                            disabled={isPending || isSelf}
                            title={isSelf ? "Não pode desativar a sua própria conta" : undefined}
                            onClick={() => run(() => setMemberStatus(row.id, "inativo"))}
                          >
                            Desativar
                          </Button>
                        ) : (
                          <Button
                            disabled={isPending}
                            onClick={() => run(() => setMemberStatus(row.id, "ativo"))}
                          >
                            Reativar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
