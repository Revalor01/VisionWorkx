import { redirect } from "next/navigation";
import { isOperator } from "@/lib/modules/adminGuard";
import { modulesConfigured, modulesServiceClient } from "@/lib/modules/supabase";
import { countModulesByType, fetchModuleCostEstimate } from "@/lib/modules/moduleStats";
import ModulesAdmin, { type AdminWorkspace } from "./ModulesAdmin";

export const dynamic = "force-dynamic";

export default async function AdminModulesPage() {
  if (!(await isOperator())) redirect("/dashboard");
  if (!modulesConfigured()) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-bold text-navy-dark">VisionWorkx modules</h1>
        <p className="mt-2 text-gray-600">
          The modules database isn&apos;t configured. Set MODULES_SUPABASE_URL, NEXT_PUBLIC_MODULES_SUPABASE_URL,
          NEXT_PUBLIC_MODULES_SUPABASE_ANON_KEY and MODULES_SUPABASE_SERVICE_ROLE_KEY.
        </p>
      </main>
    );
  }
  const db = modulesServiceClient();
  const [{ data: ws }, { data: mods }, { data: members }, { data: subs }] = await Promise.all([
    db.from("vw_workspaces").select("id, name, slug, domains, plan, created_at").order("created_at", { ascending: false }),
    db.from("vw_modules").select("id, public_id, workspace_id, type, name, status"),
    db.from("vw_workspace_members").select("workspace_id, user_id, role"),
    db.from("vw_submissions").select("workspace_id").gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString()),
  ]);
  const workspaces: AdminWorkspace[] = (ws ?? []).map((w) => ({
    ...w,
    modules: (mods ?? []).filter((m) => m.workspace_id === w.id),
    memberCount: (members ?? []).filter((m) => m.workspace_id === w.id).length,
    submissions30d: (subs ?? []).filter((s) => s.workspace_id === w.id).length,
  }));

  const allModules = mods ?? [];
  const modulesByType = countModulesByType(allModules);
  const cost = await fetchModuleCostEstimate(allModules.length);

  return (
    <ModulesAdmin
      initial={workspaces}
      stats={{
        businessCount: workspaces.length,
        liveModuleCount: allModules.filter((m) => m.status === "live").length,
        modulesByType,
        cost,
      }}
    />
  );
}
