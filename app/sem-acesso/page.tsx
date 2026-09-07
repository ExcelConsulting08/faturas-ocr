import { signOut } from "@/actions/auth";
import { Button, Card, CardBody } from "@/components/ui/primitives";

export default function SemAcessoPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardBody className="space-y-4 p-6 text-center">
          <h1 className="text-lg font-semibold">Acesso desativado</h1>
          <p className="text-sm text-muted">
            A sua conta foi desativada nesta organização. Contacte um administrador para reativar o
            acesso.
          </p>
          <form action={signOut}>
            <Button type="submit" className="w-full">
              Terminar sessão
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
