import { requireWorkspace } from "@/lib/modules/workspace";
import { embedSnippet, INSTALL_STEPS } from "@/lib/modules/install";
import { parseBrand, parseFormConfig, resolveBrand } from "@/lib/modules/config";
import { isQuoteModule, parseQuotePricing } from "@/lib/modules/quote";
import { isBookingModule, parseBookingSetup } from "@/lib/modules/booking";
import Link from "next/link";
import ModuleForm from "@/components/modules/ModuleForm";
import CopyButton from "@/components/modules/CopyButton";

const TYPE_LABEL: Record<string, string> = {
  lead_capture: "Lead capture",
  booking: "Online booking",
  quote_calculator: "Quote calculator",
  intake_form: "Intake form",
  receptionist: "AI receptionist",
};
const STATUS_PILL: Record<string, string> = {
  live: "bg-emerald-50 text-emerald-700",
  draft: "bg-gray-100 text-gray-600",
  paused: "bg-amber-50 text-amber-800",
};

export default async function WorkspaceModulesPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const { supabase, workspace, role } = await requireWorkspace(slug);
  const { data: mods } = await supabase
    .from("vw_modules")
    .select("id, public_id, type, name, status, config")
    .eq("workspace_id", workspace.id)
    .order("created_at");

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-navy-dark">Modules &amp; install</h1>
        <p className="text-sm text-gray-500">
          Paste a module&apos;s snippet into your website where you want it to appear. It only works on:{" "}
          <strong>{workspace.domains.length ? workspace.domains.join(", ") : "no websites yet — add yours in Settings"}</strong>.
        </p>
      </div>
      {role === "owner" && (
        <Link href={`/workspace/${workspace.slug}/modules/new`} className="rounded-xl bg-navy-dark px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy">
          + New module
        </Link>
      )}
      </div>

      {(mods ?? []).length === 0 && (
        <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-600">
          No modules yet. {role === "owner" ? "Create your first lead form — just describe it in a sentence." : "Ask your workspace owner to create one."}
        </p>
      )}

      {(mods ?? []).map((m) => {
        const snippet = embedSnippet(m.public_id, undefined, m.type);
        const isReceptionist = m.type === "receptionist";
        return (
          <section key={m.id} className="rounded-2xl border border-gray-200 bg-white p-6" aria-labelledby={`mod-${m.id}`}>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h2 id={`mod-${m.id}`} className="text-lg font-bold text-navy-dark">{m.name}</h2>
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">{TYPE_LABEL[m.type] ?? m.type}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_PILL[m.status] ?? ""}`}>{m.status}</span>
              {role === "owner" && (m.type === "lead_capture" || m.type === "intake_form" || m.type === "quote_calculator" || m.type === "booking" || isReceptionist) && (
                <Link href={`/workspace/${workspace.slug}/modules/${m.public_id}/edit`} className="ml-auto text-sm font-semibold text-navy hover:underline">
                  {isReceptionist ? "Edit receptionist" : "Edit form"}
                </Link>
              )}
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="min-w-0">
                <p className="mb-2 text-sm font-semibold text-gray-700">Your snippet</p>
                <div className="rounded-xl bg-gray-900 p-4">
                  <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[13px] text-gray-100">{snippet}</pre>
                  <div className="mt-3">
                    <CopyButton text={snippet} />
                  </div>
                </div>
                {m.status !== "live" && (
                  <p className="mt-2 text-xs text-amber-700">This module isn&apos;t live yet, so it won&apos;t show on your site until it&apos;s published{role === "owner" ? " (Edit form → Save & publish)" : ""}.</p>
                )}
                <details className="mt-5 rounded-xl border border-gray-200">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-800">How to install it on your site builder</summary>
                  <div className="space-y-4 border-t border-gray-100 px-4 py-4">
                    {INSTALL_STEPS.map((b) => (
                      <div key={b.builder}>
                        <h3 className="text-sm font-bold text-gray-900">{b.builder}</h3>
                        <ol className="ml-5 mt-1 list-decimal space-y-0.5 text-sm text-gray-700">
                          {b.steps.map((s) => <li key={s}>{s}</li>)}
                        </ol>
                        {b.note && <p className="mt-1 text-xs text-gray-500">{b.note}</p>}
                      </div>
                    ))}
                  </div>
                </details>
              </div>
              <div className="min-w-0">
                <p className="mb-2 text-sm font-semibold text-gray-700">Preview</p>
                {isReceptionist ? (
                  <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
                    Adds a chat button to the bottom-right corner of every page you paste it on. Paste it once, just before{" "}
                    <code>&lt;/body&gt;</code> or in your site builder&apos;s site-wide code area.
                    {role === "owner" && " Use Edit receptionist → Test it to try a conversation."}
                  </p>
                ) : (
                <div className="rounded-xl bg-gray-50 p-4">
                  <ModuleForm
                    publicId={m.public_id}
                    businessName={workspace.name}
                    logoUrl={workspace.logo_url}
                    brand={resolveBrand(parseBrand(workspace.brand), parseFormConfig(m.config).style)}
                    config={parseFormConfig(m.config)}
                    quote={isQuoteModule(m.type) ? parseQuotePricing((m.config as { quote?: unknown } | null)?.quote) : null}
                    booking={isBookingModule(m.type) ? parseBookingSetup((m.config as { booking?: unknown } | null)?.booking, workspace.time_zone) : null}
                    sourceUrl={null}
                    preview
                  />
                </div>
                )}
                {!isReceptionist && <p className="mt-2 text-xs text-gray-500">Preview only — submitting here doesn&apos;t save anything.</p>}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
