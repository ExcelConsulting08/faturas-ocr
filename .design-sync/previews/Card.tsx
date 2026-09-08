import { Badge, Button, Card, CardBody, CardHeader } from "@faturas/ui";

export const Simples = () => (
  <Card className="max-w-sm p-4">
    <p className="text-xs text-muted">Total faturas</p>
    <p className="mt-0.5 text-lg font-semibold">52</p>
    <p className="mt-0.5 text-xs text-muted">180 696,45 EUR</p>
  </Card>
);

export const ComCabecalho = () => (
  <Card className="max-w-md">
    <CardHeader>
      <h2 className="font-medium">Fornecedor</h2>
      <p className="text-sm text-muted">Dados extraídos do documento</p>
    </CardHeader>
    <CardBody className="space-y-1 text-sm">
      <p className="font-medium">La Bella Vita, Sociedade Unipessoal Lda</p>
      <p className="text-muted">NIF 513317171</p>
      <p className="text-muted">Rua Vasco da Gama 8, Porto Covo</p>
    </CardBody>
  </Card>
);

export const ComAcoes = () => (
  <Card className="max-w-md">
    <CardHeader className="flex items-center justify-between">
      <h2 className="font-medium">Centros de custo</h2>
      <Badge tone="amber">2 ativos</Badge>
    </CardHeader>
    <CardBody className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span>Marketing</span>
        <span className="text-muted">12 faturas</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span>Operações</span>
        <span className="text-muted">31 faturas</span>
      </div>
    </CardBody>
    <CardBody className="border-t border-border">
      <Button variant="primary">Criar centro de custo</Button>
    </CardBody>
  </Card>
);
