import { Input, Label } from "@faturas/ui";

export const Simples = () => <Label>Número da fatura</Label>;

export const SobreUmCampo = () => (
  <div className="max-w-sm space-y-1.5">
    <Label>Base tributável</Label>
    <Input defaultValue="27.43" inputMode="decimal" />
  </div>
);

export const ComIndicacao = () => (
  <div className="max-w-sm space-y-1.5">
    <div className="flex items-center gap-2">
      <Label>Data emissão</Label>
      <span className="text-xs text-emerald-600">✓ Datas válidas</span>
    </div>
    <Input type="date" defaultValue="2026-09-03" />
  </div>
);
