import { Card, EmptyState } from "@faturas/ui";

export const ComDescricao = () => (
  <Card className="max-w-lg">
    <EmptyState
      title="Sem faturas"
      description="Carregue faturas ou aguarde a recolha automática das caixas de email."
    />
  </Card>
);

export const SoTitulo = () => (
  <Card className="max-w-lg">
    <EmptyState title="Ainda não há centros de custo" />
  </Card>
);

export const SemCaixas = () => (
  <Card className="max-w-lg">
    <EmptyState
      title="Sem caixas configuradas"
      description="Adicione uma caixa por país para começar a recolher faturas automaticamente."
    />
  </Card>
);
