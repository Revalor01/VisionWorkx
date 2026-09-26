import Link from "next/link";
import { modulesServiceClient } from "@/lib/modules/supabase";
import { billingAllowsService } from "@/lib/modules/plans";
import InstallRequestButton from "./InstallRequestButton";

// Getting-started banner for self-serve workspaces. Disappears once the first
// real submission arrives (the surest sign the form is live on their site).
export default async function SetupChecklist({ workspaceId, slug, isOwner }: { workspaceId: string; slug: string; isOwner: boolean }) {
  const db = modulesServiceClient();
  const [{ data: ws }, { count: modules }, { count: subs }] = await Promise.all([
    db.from("vw_workspaces").select("self_serve, billing_status, install_requested_at").eq("id", workspaceId).single(),
    db.from("vw_modules").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    db.from("vw_submissions").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
  ]);
  if (!ws?.self_serve || (subs ?? 0) > 0) return null;

  const base = `/workspace/${slug}`;
  const steps = [
    { label: "Business details", done: true, href: null as string | null, cta: "" },
    { label: "Start your free trial", done: billingAllowsService(ws.billing_status), href: `${base}/billing`, cta: "Choose a plan" },
    { label: "Build your first form", done: (modules ?? 0) > 0, href: `${base}/modules/new`, cta: "Build it" },
    { label: "Put it on your website", done: false, href: `${base}/modules`, cta: "Get the snippet" },
  ];
  const next = steps.find((s) => !s.done);
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <section aria-label="Getting started" className="border-b border-blue-100 bg-blue-50/60">
      <div className="mx-auto max-w-6xl px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-navy-dark">
            Getting started · {doneCount} of {steps.length} done
          </p>
          {isOwner && (modules ?? 0) > 0 && <InstallRequestButton slug={slug} requested={!!ws.install_requested_at} />}
        </div>
        <ol className="mt-3 grid gap-2 sm:grid-cols-4">
          {steps.map((s, i) => {
            const current = s === next;
            return (
              <li
                key={s.label}
                className={`rounded-xl border px-3 py-2 text-sm ${
                  s.done ? "border-emerald-200 bg-white text-gray-500" : current ? "border-navy bg-white text-navy-dark" : "border-gray-200 bg-white/60 text-gray-500"
                }`}
              >
                <span className="font-semibold">{s.done ? "✓" : `${i + 1}.`}</span> {s.label}
                {current && s.href && (
                  <Link href={s.href} className="mt-1 block font-semibold text-navy hover:underline">
                    {s.cta} →
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
