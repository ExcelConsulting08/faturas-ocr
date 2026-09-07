"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/types/domain";

export interface UserActionState {
  error?: string;
  success?: string;
  /** Devolvida apenas quando o admin opta por password temporária. */
  temporaryPassword?: string;
}

const VALID_ROLES: Role[] = ["admin", "membro", "leitor"];

function generatePassword(): string {
  // 12 caracteres base64url: entropia suficiente para uma password de arranque.
  return randomBytes(9).toString("base64url");
}

export async function createUser(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const { organization, member } = await requireAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nome = String(formData.get("nome") ?? "").trim();
  const role = String(formData.get("role") ?? "membro") as Role;
  const metodo = String(formData.get("metodo") ?? "convite");

  if (!email) return { error: "Indique o email do utilizador." };
  if (!VALID_ROLES.includes(role)) return { error: "Papel inválido." };

  const admin = createAdminClient();
  const temporaryPassword = metodo === "password" ? generatePassword() : undefined;

  const { data: created, error: createError } = temporaryPassword
    ? await admin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { nome, must_change_password: true },
      })
    : await admin.auth.admin.inviteUserByEmail(email, {
        data: { nome },
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/callback?next=/definir-password`,
      });

  if (createError || !created.user) {
    return { error: createError?.message ?? "Não foi possível criar o utilizador." };
  }

  const { error: memberError } = await admin.from("org_members").insert({
    organization_id: organization.id,
    user_id: created.user.id,
    nome: nome || null,
    role,
    status: "ativo",
    invited_by: member.user_id,
    invited_at: new Date().toISOString(),
  });

  if (memberError) {
    // Sem associação à organização a conta não serve para nada: reverter.
    await admin.auth.admin.deleteUser(created.user.id);
    return {
      error: memberError.message.includes("duplicate")
        ? "Este utilizador já pertence a uma organização."
        : memberError.message,
    };
  }

  revalidatePath("/utilizadores");

  return temporaryPassword
    ? { success: `Utilizador ${email} criado.`, temporaryPassword }
    : { success: `Convite enviado para ${email}.` };
}

export async function updateMemberRole(memberId: string, role: Role): Promise<void> {
  const { organization } = await requireAdmin();
  if (!VALID_ROLES.includes(role)) throw new Error("Papel inválido");

  if (role !== "admin" && (await isLastActiveAdmin(organization.id, memberId))) {
    throw new Error("A organização tem de manter pelo menos um administrador ativo.");
  }

  const supabase = await createClient();
  await supabase
    .from("org_members")
    .update({ role })
    .eq("id", memberId)
    .eq("organization_id", organization.id);

  revalidatePath("/utilizadores");
}

export async function setMemberStatus(
  memberId: string,
  status: "ativo" | "inativo",
): Promise<void> {
  const { organization } = await requireAdmin();

  if (status === "inativo" && (await isLastActiveAdmin(organization.id, memberId))) {
    throw new Error("A organização tem de manter pelo menos um administrador ativo.");
  }

  const supabase = await createClient();
  await supabase
    .from("org_members")
    .update({ status })
    .eq("id", memberId)
    .eq("organization_id", organization.id);

  revalidatePath("/utilizadores");
}

export async function resetMemberPassword(memberId: string): Promise<string> {
  const { organization } = await requireAdmin();

  const admin = createAdminClient();
  const { data: target } = await admin
    .from("org_members")
    .select("user_id")
    .eq("id", memberId)
    .eq("organization_id", organization.id)
    .single<{ user_id: string }>();

  if (!target) throw new Error("Utilizador não encontrado");

  const password = generatePassword();
  const { error } = await admin.auth.admin.updateUserById(target.user_id, {
    password,
    user_metadata: { must_change_password: true },
  });

  if (error) throw new Error(error.message);

  return password;
}

/** Impede que a organização fique sem qualquer administrador ativo. */
async function isLastActiveAdmin(organizationId: string, memberId: string): Promise<boolean> {
  const admin = createAdminClient();

  const { data } = await admin
    .from("org_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("role", "admin")
    .eq("status", "ativo");

  return data?.length === 1 && data[0].id === memberId;
}
