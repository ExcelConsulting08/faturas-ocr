import { Badge } from "@faturas/ui";

export const Tons = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge tone="neutral">Rascunho</Badge>
    <Badge tone="green">Confirmada</Badge>
    <Badge tone="amber">Por pagar</Badge>
    <Badge tone="red">Falhada</Badge>
    <Badge tone="indigo">Por rever</Badge>
    <Badge tone="sky">PT</Badge>
  </div>
);

export const EstadosDeFatura = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Badge tone="green">Auto-confirmada</Badge>
    <Badge tone="indigo">Por rever</Badge>
    <Badge tone="red">Falhada</Badge>
    <Badge tone="neutral">A processar</Badge>
  </div>
);

export const EmLinhaComTexto = () => (
  <div className="flex items-center gap-1.5 text-sm">
    <span>FT 2026A/00147</span>
    <Badge tone="amber">DUP</Badge>
    <Badge tone="neutral">NC</Badge>
  </div>
);
