import { Card, CardBody, CardHeader } from "@faturas/ui";
import { missingCoreEnvVars } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function ConfigurarPage() {
  const missing = missingCoreEnvVars();

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Configuração necessária</h1>
        <p className="text-sm text-muted">
          A aplicação precisa de um projeto Supabase para guardar os dados e autenticar utilizadores.
        </p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-medium">Variáveis em falta</h2>
        </CardHeader>
        <CardBody>
          {missing.length === 0 ? (
            <p className="text-sm text-emerald-700">
              Está tudo configurado. Reinicie o servidor de desenvolvimento.
            </p>
          ) : (
            <ul className="space-y-1 font-mono text-sm">
              {missing.map((name) => (
                <li key={name} className="text-red-600">
                  {name}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-medium">Como configurar</h2>
        </CardHeader>
        <CardBody className="space-y-3 text-sm">
          <p>
            <span className="font-medium">1.</span> Crie um projeto em{" "}
            <a href="https://supabase.com" className="text-primary hover:underline">
              supabase.com
            </a>{" "}
            (o plano gratuito é suficiente).
          </p>
          <p>
            <span className="font-medium">2.</span> No SQL Editor do projeto, cole e execute o
            conteúdo de <code className="font-mono">supabase/migrations/0001_init.sql</code>.
          </p>
          <p>
            <span className="font-medium">3.</span> Em Project Settings → API, copie as chaves para
            o ficheiro <code className="font-mono">.env.local</code> (veja{" "}
            <code className="font-mono">.env.example</code>).
          </p>
          <p>
            <span className="font-medium">4.</span> Reinicie o servidor de desenvolvimento.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
