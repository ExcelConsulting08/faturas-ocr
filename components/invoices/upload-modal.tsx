"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Upload, X } from "lucide-react";

import { uploadInvoices, type UploadResult } from "@/actions/invoices";
import { compressImage } from "@/lib/invoices/compress-image";
import { Button, Card, CardBody, CardHeader, Select } from "@/components/ui/primitives";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.tiff";

export function UploadModal({ paises }: { paises: { pais: string; empresa: string }[] }) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);
  // Estado, não uma referência ao elemento: garante que o país escolhido é o
  // que segue no envio, mesmo que o componente volte a renderizar entretanto.
  const [pais, setPais] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function submit(files: FileList | null) {
    if (!files?.length) return;

    startTransition(async () => {
      const formData = new FormData();
      // Fotografias são reduzidas aqui: a alternativa é rebentar o limite do
      // corpo do pedido e o utilizador levar com um erro de servidor opaco.
      for (const file of files) {
        formData.append("files", await compressImage(file));
      }
      if (pais) formData.append("pais", pais);

      try {
        const outcome = await uploadInvoices(formData);
        setResults(outcome);
        router.refresh();
      } catch (error) {
        // O limite do corpo do pedido rebenta antes de chegar ao servidor, com
        // um erro que nada diz ao utilizador. Traduzimo-lo para algo acionável.
        const message = error instanceof Error ? error.message : "";
        setResults(
          [...files].map((file) => ({
            fileName: file.name,
            ok: false,
            message: /body|size|limit|413/i.test(message)
              ? "Ficheiro demasiado grande para envio. Tente uma fotografia com menos resolução."
              : "Falha no envio. Verifique a ligação e tente novamente.",
          })),
        );
      }
    });
  }

  function close() {
    setOpen(false);
    setResults([]);
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" />
        Upload
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader className="flex items-center justify-between">
              <h2 className="font-medium">Upload de faturas</h2>
              <button onClick={close} className="text-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </CardHeader>

            <CardBody className="space-y-4">
              {paises.length > 0 ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted">País:</span>
                  <Select
                    value={pais}
                    disabled={pending}
                    onChange={(event) => setPais(event.target.value)}
                  >
                    <option value="">Sem país</option>
                    {paises.map((entry) => (
                      <option key={entry.pais} value={entry.pais}>
                        {entry.pais} — {entry.empresa}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}

              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  submit(event.dataTransfer.files);
                }}
                className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
                  dragging ? "border-primary bg-indigo-50" : "border-border"
                }`}
              >
                <p className="text-sm text-muted">Arraste ficheiros para aqui ou</p>
                <Button variant="primary" disabled={pending} onClick={() => inputRef.current?.click()}>
                  {pending ? "A processar..." : "Selecionar ficheiros"}
                </Button>
                <p className="text-xs text-gray-400">PDF, JPG, PNG, WebP, HEIC ou TIFF até 20MB</p>

                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(event) => submit(event.target.files)}
                />
              </div>

              {results.length > 0 ? (
                <div className="space-y-2">
                  <ul className="space-y-1 text-sm">
                    {results.map((result) => (
                      <li key={result.fileName} className="flex items-start gap-2">
                        <span className={result.ok ? "text-emerald-600" : "text-red-600"}>
                          {result.ok ? "✓" : "✕"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{result.fileName}</span>
                          {result.message ? (
                            <span className="text-xs text-muted">{result.message}</span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted">
                    {pais
                      ? `Classificadas com o país ${pais}.`
                      : "Carregadas sem país. Pode defini-lo no detalhe de cada fatura."}
                  </p>
                </div>
              ) : null}
            </CardBody>
          </Card>
        </div>
      ) : null}
    </>
  );
}
