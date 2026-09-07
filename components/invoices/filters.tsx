"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button, Input, Select } from "@/components/ui/primitives";

export function InvoiceFilters({ paises }: { paises: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== "todos" && value !== "") {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    next.delete("page");
    router.push(`/invoices?${next.toString()}`);
  }

  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          update("search", search);
        }}
      >
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Pesquisar por número ou fornecedor"
          className="max-w-xs"
        />
        <Button type="submit">Pesquisar</Button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={params.get("periodo") ?? "tudo"} onChange={(e) => update("periodo", e.target.value)}>
          <option value="mes">Este mês</option>
          <option value="trimestre">Este trimestre</option>
          <option value="ano">Este ano</option>
          <option value="tudo">Tudo</option>
        </Select>

        <Select value={params.get("estado") ?? "todos"} onChange={(e) => update("estado", e.target.value)}>
          <option value="todos">Todos os estados</option>
          <option value="por_rever">Por rever</option>
          <option value="auto_confirmada">Auto-confirmada</option>
          <option value="confirmada">Confirmada</option>
          <option value="falhada">Falhada</option>
          <option value="a_processar">A processar</option>
        </Select>

        <Select value={params.get("pagamento") ?? "todos"} onChange={(e) => update("pagamento", e.target.value)}>
          <option value="todos">Pagamento</option>
          <option value="por_pagar">Por pagar</option>
          <option value="paga">Paga</option>
        </Select>

        {paises.length > 0 ? (
          <Select value={params.get("pais") ?? ""} onChange={(e) => update("pais", e.target.value)}>
            <option value="">Todos os países</option>
            {paises.map((pais) => (
              <option key={pais} value={pais}>
                {pais}
              </option>
            ))}
          </Select>
        ) : null}

        <div className="ml-auto flex gap-2">
          <a href={`/api/export/csv?${params.toString()}`}>
            <Button type="button">Exportar CSV</Button>
          </a>
        </div>
      </div>
    </div>
  );
}
