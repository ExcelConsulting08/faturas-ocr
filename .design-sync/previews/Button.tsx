import { Button } from "@faturas/ui";

export const Variantes = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Button variant="primary">Confirmar</Button>
    <Button variant="secondary">Guardar</Button>
    <Button variant="warning">Marcar como paga</Button>
    <Button variant="danger">Descartar</Button>
    <Button variant="ghost">Cancelar</Button>
  </div>
);

export const Desativado = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Button variant="primary" disabled>
      A gravar...
    </Button>
    <Button variant="secondary" disabled>
      Exportar CSV
    </Button>
  </div>
);

export const ComIcone = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Button variant="primary">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 6 9 17l-5-5" />
      </svg>
      Confirmar
    </Button>
    <Button variant="danger">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
      Descartar
    </Button>
  </div>
);
