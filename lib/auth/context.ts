import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { OrgContext, Organization, OrgMember } from "@/types/domain";

/**
 * Resolve o utilizador autenticado e a sua organização.
 * Redireciona para login/onboarding quando o contexto não está completo, por
 * isso pode ser chamada diretamente no topo de qualquer página autenticada.
 */
export async function requireOrgContext(): Promise<OrgContext> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: member } = await supabase
    .from("org_members")
    .select("*, organizations(*)")
    .eq("user_id", user.id)
    .maybeSingle<OrgMember & { organizations: Organization }>();

  if (!member) redirect("/comecar");

  if (member.status !== "ativo") redirect("/sem-acesso");

  const { organizations, ...memberFields } = member;

  return {
    organization: organizations,
    member: memberFields,
    userEmail: user.email ?? "",
  };
}

export function canWrite(member: OrgMember): boolean {
  return member.status === "ativo" && (member.role === "admin" || member.role === "membro");
}

export function isAdmin(member: OrgMember): boolean {
  return member.status === "ativo" && member.role === "admin";
}

export async function requireAdmin(): Promise<OrgContext> {
  const context = await requireOrgContext();
  if (!isAdmin(context.member)) redirect("/invoices");
  return context;
}
