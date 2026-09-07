import { Sidebar } from "@/components/layout/sidebar";
import { requireOrgContext } from "@/lib/auth/context";
import { signOut } from "@/actions/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { organization, member, userEmail } = await requireOrgContext();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={member.role} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface px-6">
          <span className="font-semibold">{organization.nome}</span>

          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted">{userEmail}</span>
            <form action={signOut}>
              <button type="submit" className="text-muted transition-colors hover:text-foreground">
                Sair
              </button>
            </form>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
