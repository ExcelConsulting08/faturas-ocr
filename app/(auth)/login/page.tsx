"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signIn, type ActionState } from "@/actions/auth";
import { Button, Card, CardBody, Field, Input } from "@/components/ui/primitives";

const INITIAL: ActionState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, INITIAL);

  return (
    <Card>
      <CardBody className="space-y-5 p-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Inicie sessão na sua conta</h1>
          <p className="text-sm text-muted">Gestão de faturas com extração automática.</p>
        </div>

        <form action={formAction} className="space-y-4">
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>

          <Field label="Password">
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>

          {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}

          <Button type="submit" variant="primary" className="w-full" disabled={pending}>
            {pending ? "A entrar..." : "Entrar"}
          </Button>
        </form>

        <div className="flex items-center justify-between text-sm">
          <Link href="/recuperar-password" className="text-primary hover:underline">
            Esqueceu a password?
          </Link>
          <Link href="/registar" className="text-muted hover:underline">
            Criar conta
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}
