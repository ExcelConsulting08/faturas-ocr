"use client";

import Link from "next/link";
import { useActionState } from "react";

import { requestPasswordReset, type ActionState } from "@/actions/auth";
import { Button, Card, CardBody, Field, Input } from "@faturas/ui";

const INITIAL: ActionState = {};

export default function RecuperarPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, INITIAL);

  return (
    <Card>
      <CardBody className="space-y-5 p-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Repor password</h1>
          <p className="text-sm text-muted">Enviamos um link para definir uma nova password.</p>
        </div>

        <form action={formAction} className="space-y-4">
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>

          {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
          {state.success ? <p className="text-sm text-emerald-700">{state.success}</p> : null}

          <Button type="submit" variant="primary" className="w-full" disabled={pending}>
            {pending ? "A enviar..." : "Enviar link"}
          </Button>
        </form>

        <Link href="/login" className="block text-sm text-muted hover:underline">
          ← Voltar ao início de sessão
        </Link>
      </CardBody>
    </Card>
  );
}
