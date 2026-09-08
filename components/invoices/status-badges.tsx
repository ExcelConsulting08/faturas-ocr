import { Badge } from "@faturas/ui";
import type { InvoiceStatus, PaymentStatus } from "@/types/domain";

const STATUS_LABELS: Record<InvoiceStatus, { label: string; tone: "green" | "amber" | "indigo" | "red" | "neutral" }> = {
  a_processar: { label: "A processar", tone: "neutral" },
  auto_confirmada: { label: "Auto-confirmada", tone: "green" },
  confirmada: { label: "Confirmada", tone: "green" },
  por_rever: { label: "Por rever", tone: "indigo" },
  falhada: { label: "Falhada", tone: "red" },
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  const { label, tone } = STATUS_LABELS[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return status === "paga" ? (
    <Badge tone="green">Paga</Badge>
  ) : (
    <Badge tone="amber">Por pagar</Badge>
  );
}

export function ConfidenceBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const percent = Math.round(score * 100);
  const tone = percent >= 90 ? "green" : percent >= 60 ? "amber" : "red";
  return <Badge tone={tone}>{percent}% confiança</Badge>;
}

export function CountryBadge({ pais }: { pais: string | null }) {
  if (!pais) return <span className="text-muted">—</span>;
  return <Badge tone="sky">{pais.toUpperCase()}</Badge>;
}
