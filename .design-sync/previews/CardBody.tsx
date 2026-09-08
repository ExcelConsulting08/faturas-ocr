import { Card, CardBody, CardHeader, Field, Input } from "@faturas/ui";

export const Texto = () => (
  <Card className="max-w-md">
    <CardBody className="space-y-1 text-sm">
      <p className="font-medium">La Bella Vita, Sociedade Unipessoal Lda</p>
      <p className="text-muted">NIF 513317171</p>
    </CardBody>
  </Card>
);

export const ComFormulario = () => (
  <Card className="max-w-md">
    <CardHeader>
      <h2 className="font-medium">Fatura</h2>
    </CardHeader>
    <CardBody className="grid gap-4 sm:grid-cols-2">
      <Field label="Número">
        <Input defaultValue="FS A2632/15326" />
      </Field>
      <Field label="Moeda">
        <Input defaultValue="EUR" />
      </Field>
    </CardBody>
  </Card>
);

export const SeccoesSeparadas = () => (
  <Card className="max-w-md">
    <CardBody className="text-sm">
      <p className="text-muted">Base tributável</p>
      <p className="text-lg font-medium">27,43</p>
    </CardBody>
    <CardBody className="border-t border-border text-sm">
      <p className="text-muted">Total a pagar</p>
      <p className="text-lg font-semibold">31,00</p>
    </CardBody>
  </Card>
);
