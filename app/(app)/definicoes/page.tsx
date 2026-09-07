import { SettingsTabs } from "@/components/settings/settings-tabs";
import { isAdmin, requireOrgContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { ErpIntegrationSettings, ExtractionPreferences } from "@/types/domain";

export const dynamic = "force-dynamic";

export default async function DefinicoesPage() {
  const { organization, member, userEmail } = await requireOrgContext();
  const supabase = await createClient();

  const [preferences, erp] = await Promise.all([
    supabase
      .from("extraction_preferences")
      .select("*")
      .eq("organization_id", organization.id)
      .maybeSingle<ExtractionPreferences>(),
    supabase
      .from("erp_integration_settings")
      .select("*")
      .eq("organization_id", organization.id)
      .maybeSingle<ErpIntegrationSettings>(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">
      <h1 className="text-2xl font-semibold">Definições</h1>

      <SettingsTabs
        organization={organization}
        userEmail={userEmail}
        preferences={preferences.data}
        erp={erp.data}
        admin={isAdmin(member)}
      />
    </div>
  );
}
