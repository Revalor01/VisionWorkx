import { redirect } from "next/navigation";
import { isOperator } from "@/lib/modules/adminGuard";
import { modulesConfigured, modulesServiceClient } from "@/lib/modules/supabase";
import { countModulesByType, fetchModuleCostEstimate } from "@/lib/modules/moduleStats";
import { parseFormConfig } from "@/lib/modules/config";
import { testWorkspaceIds } from "@/lib/modules/testWorkspaces";
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
  const [{ data: ws }, { data: mods }, { data: members }, { data: subs30d }, { data: payments }] = await Promise.all([
    db
      .from("vw_workspaces")
      .select("id, name, slug, domains, plan, billing_status, self_serve, install_requested_at, created_at, stripe_connect_account_id, connect_payments_status")
      .order("created_at", { ascending: false }),
    db.from("vw_modules").select("id, public_id, workspace_id, type, name, status, config"),
    db.from("vw_workspace_members").select("workspace_id, user_id, role"),
    // Server component rendered per request (force-dynamic): reading the clock here is intended.
    // eslint-disable-next-line react-hooks/purity
    db.from("vw_submissions").select("workspace_id").gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString()),
    // All-time, not just 30d -- revenue collected doesn't reset like the submissions-cap window does.
    db.from("vw_submissions").select("workspace_id, payment_status, payment_amount_cents").neq("payment_status", "none"),
  ]);

  const testIds = await testWorkspaceIds(db);
  const allModules = (mods ?? []).filter((m) => !testIds.has(m.workspace_id));
  const allPayments = payments ?? [];
  const paymentsByWorkspace = (workspaceId: string) => allPayments.filter((p) => p.workspace_id === workspaceId);

  const workspaces: AdminWorkspace[] = (ws ?? []).filter((w) => !testIds.has(w.id)).map((w) => {
    const wsModules = allModules.filter((m) => m.workspace_id === w.id);
    const wsPayments = paymentsByWorkspace(w.id);
    const { stripe_connect_account_id, ...wRest } = w;
    return {
      ...wRest,
      hasConnectAccount: !!stripe_connect_account_id,
      modules: wsModules,
      paymentEnabledModules: wsModules.filter((m) => parseFormConfig(m.config).payment?.enabled).length,
      memberCount: (members ?? []).filter((m) => m.workspace_id === w.id).length,
      submissions30d: (subs30d ?? []).filter((s) => s.workspace_id === w.id).length,
      paidCount: wsPayments.filter((p) => p.payment_status === "paid").length,
      paidTotalCents: wsPayments.filter((p) => p.payment_status === "paid").reduce((s, p) => s + (p.payment_amount_cents ?? 0), 0),
      pendingCount: wsPayments.filter((p) => p.payment_status === "pending").length,
      pendingTotalCents: wsPayments.filter((p) => p.payment_status === "pending").reduce((s, p) => s + (p.payment_amount_cents ?? 0), 0),
    };
  });

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
        connectedBusinessCount: workspaces.filter((w) => w.connect_payments_status === "active").length,
        totalPaidCents: allPayments.filter((p) => p.payment_status === "paid").reduce((s, p) => s + (p.payment_amount_cents ?? 0), 0),
        totalPendingCents: allPayments.filter((p) => p.payment_status === "pending").reduce((s, p) => s + (p.payment_amount_cents ?? 0), 0),
      }}
    />
  );
}
