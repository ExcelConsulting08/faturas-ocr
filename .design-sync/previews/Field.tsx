import { Field, Input, Select } from "@faturas/ui";

export const ComTexto = () => (
  <div className="max-w-sm">
    <Field label="Número da fatura">
      <Input defaultValue="FT 2026A/00147" />
    </Field>
  </div>
);

export const ComValidacao = () => (
  <div className="max-w-sm space-y-4">
    <Field label="NIF" hint={<span className="text-xs text-emerald-600">✓ NIF português válido</span>}>
      <Input defaultValue="513317171" />
    </Field>
    <Field label="IBAN" hint={<span className="text-xs text-amber-600">IBAN inválido</span>}>
      <Input defaultValue="PT50 0002 0123 4567" />
    </Field>
  </div>
);

export const ComSelecao = () => (
  <div className="max-w-sm">
    <Field label="Centro de custo">
      <Select className="w-full" defaultValue="marketing">
        <option value="">Sem centro de custo</option>
        <option value="marketing">Marketing</option>
        <option value="operacoes">Operações</option>
      </Select>
    </Field>
  </div>
);

export const Desativado = () => (
  <div className="max-w-sm">
    <Field label="Email">
      <Input defaultValue="teste@empresa.pt" disabled />
    </Field>
  </div>
);
