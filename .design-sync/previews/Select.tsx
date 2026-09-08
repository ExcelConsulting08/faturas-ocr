import { Select } from "@faturas/ui";

export const Simples = () => (
  <Select defaultValue="todos">
    <option value="todos">Todos os estados</option>
    <option value="por_rever">Por rever</option>
    <option value="confirmada">Confirmada</option>
    <option value="falhada">Falhada</option>
  </Select>
);

export const EmFiltros = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Select defaultValue="ano">
      <option value="mes">Este mês</option>
      <option value="trimestre">Este trimestre</option>
      <option value="ano">Este ano</option>
    </Select>
    <Select defaultValue="todos">
      <option value="todos">Todos os estados</option>
      <option value="por_rever">Por rever</option>
    </Select>
    <Select defaultValue="">
      <option value="">Todos os países</option>
      <option value="PT">Portugal</option>
      <option value="ES">Espanha</option>
    </Select>
  </div>
);

export const LarguraTotal = () => (
  <div className="max-w-sm">
    <Select className="w-full" defaultValue="marketing">
      <option value="">Sem centro de custo</option>
      <option value="marketing">Marketing</option>
      <option value="operacoes">Operações</option>
    </Select>
  </div>
);
