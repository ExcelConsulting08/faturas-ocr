"use client";

import { useActionState } from "react";

import { createOrganization, type ActionState } from "@/actions/auth";
import { Button, Card, CardBody, Field, Input } from "@/components/ui/primitives";

const INITIAL: ActionState = {};

export default function ComecarPage() {
  const [state, formAction, pending] = useActionState(createOrganization, INITIAL);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <Card>
          <CardBody className="space-y-5 p-6">
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">Criar organização</h1>
              <p className="text-sm text-muted">
                As faturas, fornecedores e utilizadores ficam associados a esta organização.
              </p>
            </div>

            <form action={formAction} className="space-y-4">
              <Field label="Nome da organização">
                <Input name="nome" required placeholder="Empresa, Lda." />
              </Field>

              <Field label="NIF">
                <Input name="nif" required inputMode="numeric" placeholder="500000000" />
              </Field>

              <Field label="O seu nome">
                <Input name="user_nome" placeholder="Opcional" />
              </Field>

              {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

              <Button type="submit" variant="primary" className="w-full" disabled={pending}>
                {pending ? "A criar..." : "Criar organização"}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
