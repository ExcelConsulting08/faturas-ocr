"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Building2, FileText, Inbox, Settings, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Role } from "@/types/domain";

const NAV_ITEMS = [
  { href: "/invoices", label: "Faturas", icon: FileText, adminOnly: false },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3, adminOnly: false },
  { href: "/centros-custo", label: "Centro de Custos", icon: Building2, adminOnly: false },
  { href: "/mailboxes", label: "Mailboxes", icon: Inbox, adminOnly: true },
  { href: "/utilizadores", label: "Utilizadores", icon: Users, adminOnly: true },
];

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const isAdmin = role === "admin";

  return (
    <aside className="flex w-48 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-16 items-center gap-2 border-b border-border px-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
          F
        </div>
        <span className="text-lg font-semibold tracking-tight">Faturas</span>
      </div>

      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active ? "bg-indigo-50 font-medium text-primary" : "text-foreground hover:bg-gray-50",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-3 py-3">
        <Link
          href="/definicoes"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
            pathname.startsWith("/definicoes")
              ? "bg-indigo-50 font-medium text-primary"
              : "text-foreground hover:bg-gray-50",
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          Definições
        </Link>
      </div>
    </aside>
  );
}
