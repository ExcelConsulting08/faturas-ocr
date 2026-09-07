"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signUp, type ActionState } from "@/actions/auth";
import { Button, Card, CardBody, Field, Input } from "@/components/ui/primitives";

const INITIAL: ActionState = {};

export default function RegistarPage() {
  const [state, formAction, pending] = useActionState(signUp, INITIAL);

  return (
    <Card>
      <CardBody className="space-y-5 p-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Criar conta</h1>
          <p className="text-sm text-muted">A seguir configura a sua organização.</p>
        </div>

        <form action={formAction} className="space-y-4">
          <Field label="Nome">
            <Input name="nome" autoComplete="name" />
          </Field>

          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>

          <Field label="Password">
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>

          {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
          {state.success ? <p className="text-sm text-emerald-700">{state.success}</p> : null}

          <Button type="submit" variant="primary" className="w-full" disabled={pending}>
            {pending ? "A criar..." : "Criar conta"}
          </Button>
        </form>

        <p className="text-sm text-muted">
          Já tem conta?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Entrar
          </Link>
        </p>
      </CardBody>
    </Card>
  );
}
