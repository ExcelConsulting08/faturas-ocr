"use server";

import { revalidatePath } from "next/cache";

import { canWrite, requireOrgContext } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Invoice } from "@/types/domain";

const BUCKET = "faturas";

export interface OriginalUploadTicket {
  path: string;
  token: string;
}

/**
 * Prepara o envio da imagem original diretamente para o armazenamento.
 *
 * O original não pode passar pelo Server Action: é justamente por ser grande
 * demais que existe a versão comprimida. Um URL assinado deixa o browser
 * enviá-lo sem tocar no limite do corpo do pedido.
 *
 * Só se aplica ao Supabase Storage; com SharePoint devolve null e a aplicação
 * fica apenas com a versão enviada para extração.
 */
export async function prepareOriginalUpload(
  invoiceId: string,
  fileName: string,
): Promise<OriginalUploadTicket | null> {
  const { organization, member } = await requireOrgContext();
  if (!canWrite(member)) throw new Error("Sem permissão");

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("storage_provider, storage_id")
    .eq("id", invoiceId)
    .eq("organization_id", organization.id)
    .maybeSingle<Pick<Invoice, "storage_provider" | "storage_id">>();

  if (!invoice || invoice.storage_provider !== "supabase" || !invoice.storage_id) return null;

  // Ao lado do ficheiro enviado, com sufixo que o identifica como original.
  const extensao = fileName.includes(".") ? fileName.split(".").pop()! : "jpg";
  const path = `${invoice.storage_id.replace(/\.[^.]+$/, "")}__original.${extensao}`;

  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path, {
    upsert: true,
  });

  if (error || !data) return null;

  return { path: data.path, token: data.token };
}

/** Regista o original depois de o browser o ter enviado com sucesso. */
export async function recordOriginalUpload(invoiceId: string, path: string): Promise<void> {
  const { organization, member } = await requireOrgContext();
  if (!canWrite(member)) throw new Error("Sem permissão");

  const supabase = await createClient();
  await supabase
    .from("invoices")
    .update({ storage_original_id: path, storage_original_path: `/${path}` })
    .eq("id", invoiceId)
    .eq("organization_id", organization.id);

  revalidatePath(`/invoices/${invoiceId}`);
}
