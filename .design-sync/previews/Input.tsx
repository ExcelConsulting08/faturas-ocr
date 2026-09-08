import { Input } from "@faturas/ui";

export const Preenchido = () => (
  <div className="max-w-sm">
    <Input defaultValue="La Bella Vita, Sociedade Unipessoal Lda" />
  </div>
);

export const ComPlaceholder = () => (
  <div className="max-w-sm">
    <Input placeholder="Pesquisar por número ou fornecedor" />
  </div>
);

export const Desativado = () => (
  <div className="max-w-sm">
    <Input defaultValue="teste@empresa.pt" disabled />
  </div>
);

export const Tipos = () => (
  <div className="max-w-sm space-y-2">
    <Input type="date" defaultValue="2026-09-03" />
    <Input type="number" defaultValue="1458.16" />
    <Input type="password" defaultValue="password" />
  </div>
);
