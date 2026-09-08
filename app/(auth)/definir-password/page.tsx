"use client";

import { useActionState } from "react";

import { updatePassword, type ActionState } from "@/actions/auth";
import { Button, Card, CardBody, Field, Input } from "@faturas/ui";

const INITIAL: ActionState = {};

export default function DefinirPasswordPage() {
  const [state, formAction, pending] = useActionState(updatePassword, INITIAL);

  return (
    <Card>
      <CardBody className="space-y-5 p-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Definir nova password</h1>
          <p className="text-sm text-muted">Escolha uma password com pelo menos 8 caracteres.</p>
        </div>

        <form action={formAction} className="space-y-4">
          <Field label="Nova password">
            <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
          </Field>

          <Field label="Confirmar password">
            <Input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </Field>

          {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

          <Button type="submit" variant="primary" className="w-full" disabled={pending}>
            {pending ? "A guardar..." : "Guardar password"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
