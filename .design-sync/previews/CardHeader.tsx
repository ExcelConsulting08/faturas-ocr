import { Badge, Button, Card, CardBody, CardHeader } from "@faturas/ui";

export const SoTitulo = () => (
  <Card className="max-w-md">
    <CardHeader>
      <h2 className="font-medium">Fornecedor</h2>
    </CardHeader>
    <CardBody className="text-sm text-muted">Dados extraídos do documento.</CardBody>
  </Card>
);

export const ComSubtitulo = () => (
  <Card className="max-w-md">
    <CardHeader>
      <h2 className="font-medium">Valores</h2>
      <p className="text-sm text-muted">
        Lidos do documento. Corrija-os se não corresponderem ao que está impresso.
      </p>
    </CardHeader>
    <CardBody className="text-sm">Base tributável 27,43 · IVA 3,57 · Total 31,00</CardBody>
  </Card>
);

export const ComAcaoAlinhada = () => (
  <Card className="max-w-md">
    <CardHeader className="flex items-center justify-between">
      <h2 className="font-medium">Linhas</h2>
      <Button className="text-xs">Adicionar linha</Button>
    </CardHeader>
    <CardBody className="flex items-center justify-between text-sm">
      <span>Serviços de consultoria</span>
      <Badge tone="neutral">1 100,00</Badge>
    </CardBody>
  </Card>
);
