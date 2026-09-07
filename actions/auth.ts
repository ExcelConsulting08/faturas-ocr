"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
  success?: string;
}

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) return { error: "Preencha o email e a password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: "Credenciais inválidas." };

  redirect("/invoices");
}

export async function signUp(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nome = String(formData.get("nome") ?? "").trim();

  if (!email || !password) return { error: "Preencha o email e a password." };
  if (password.length < 8) return { error: "A password deve ter pelo menos 8 caracteres." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nome } },
  });

  if (error) return { error: error.message };

  // Com a confirmação de email ligada, o Supabase cria o utilizador mas não
  // devolve sessão: sem este aviso o utilizador era devolvido ao login sem perceber porquê.
  if (!data.session) {
    return {
      success:
        "Conta criada. Confirme o endereço através do link que enviámos por email e depois inicie sessão.",
    };
  }

  redirect("/comecar");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function requestPasswordReset(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Indique o seu email." };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/callback?next=/definir-password`,
  });

  // Resposta idêntica exista ou não a conta, para não revelar quem está registado.
  return { success: "Se existir uma conta com esse email, receberá instruções para repor a password." };
}

export async function updatePassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) return { error: "A password deve ter pelo menos 8 caracteres." };
  if (password !== confirm) return { error: "As passwords não coincidem." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) return { error: error.message };

  redirect("/invoices");
}

export async function createOrganization(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const nome = String(formData.get("nome") ?? "").trim();
  const nif = String(formData.get("nif") ?? "").trim();
  const userNome = String(formData.get("user_nome") ?? "").trim();

  if (!nome || !nif) return { error: "Indique o nome e o NIF da organização." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization_with_owner", {
    p_nome: nome,
    p_nif: nif,
    p_user_nome: userNome || null,
  });

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/invoices");
}
