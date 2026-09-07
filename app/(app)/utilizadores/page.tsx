import { UsersManager } from "@/components/users/users-manager";
import { requireAdmin } from "@/lib/auth/context";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrgMember } from "@/types/domain";

export const dynamic = "force-dynamic";

interface MemberRow extends OrgMember {
  email: string;
}

async function loadMembers(organizationId: string): Promise<MemberRow[]> {
  const admin = createAdminClient();

  const { data: members } = await admin
    .from("org_members")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .returns<OrgMember[]>();

  if (!members?.length) return [];

  // O email vive em auth.users, fora do alcance do PostgREST: resolvido via Admin API.
  const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailById = new Map(authUsers.users.map((user) => [user.id, user.email ?? ""]));

  return members.map((member) => ({ ...member, email: emailById.get(member.user_id) ?? "—" }));
}

export default async function UtilizadoresPage() {
  const { organization, member } = await requireAdmin();
  const members = await loadMembers(organization.id);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Utilizadores</h1>
        <p className="text-sm text-muted">
          Contas geridas pela aplicação, independentes do Microsoft 365. Pode dar acesso a pessoas
          que não existem no diretório da empresa.
        </p>
      </div>

      <UsersManager members={members} currentMemberId={member.id} />
    </div>
  );
}
