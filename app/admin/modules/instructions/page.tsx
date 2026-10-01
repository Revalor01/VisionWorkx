import Link from "next/link";
import { redirect } from "next/navigation";
import { isOperator } from "@/lib/modules/adminGuard";
import { AdminHeader } from "../../AdminNavHeader";

export const dynamic = "force-dynamic";

// Operator-facing walkthrough of the /admin/modules page. Linked from that
// page's header ("Instructions →"). Kept as a plain server-rendered page so it
// stays readable without the client bundle; gated by the same operator check.

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-2xl border border-[#b8860b] bg-white p-5">
      <h2 className="text-lg font-bold text-navy-dark">{title}</h2>
      <div className="space-y-2 text-sm text-gray-700">{children}</div>
    </section>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#b8860b] text-xs font-semibold text-white">
        {n}
      </span>
      <div>{children}</div>
    </div>
  );
}

export default async function AdminModulesInstructionsPage() {
  if (!(await isOperator())) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-white">
      <AdminHeader badge="Modules" />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:px-10">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Operator guide</p>
            <h1 className="text-2xl font-bold text-navy-dark">Using the Modules admin page</h1>
          </div>
          <Link
            href="/admin/modules"
            className="rounded-lg border border-[#b8860b] px-3 py-1.5 text-sm font-semibold text-[#8a6d3b] hover:bg-[#b8860b]/10"
          >
            ← Back to Modules
          </Link>
        </div>

        <p className="text-sm text-gray-600">
          <strong>/admin/modules</strong> is the operator view of every client workspace that runs VisionWorkx
          embeddable modules (lead capture, booking, quote calculator, intake form). It is where you create a client
          workspace, hand out logins, add modules, flip them live, and watch spend and payments across all clients.
          Test workspaces are filtered out of every number on the page.
        </p>

        <Section title="The stat cards (top row)">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Businesses</strong> — count of live (non-test) client workspaces.</li>
            <li><strong>Modules created</strong> — every module ever created across all workspaces, any status.</li>
            <li><strong>Modules live</strong> — of those, how many are currently set to <em>live</em> (embedded and accepting submissions).</li>
            <li>
              <strong>Est. AI cost / module</strong> — the average Claude drafting cost per module, with the all-time
              total and the number of measured drafts underneath. See the cost table note below for why this is an
              average, not a real per-type figure.
            </li>
          </ul>
        </Section>

        <Section title="Connected to Stripe / Collected / Pending">
          <p>The second row of cards summarizes payments across all workspaces:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Connected to Stripe</strong> — how many businesses have finished Stripe Connect onboarding (payments active).</li>
            <li><strong>Collected</strong> — all-time total actually paid, across every workspace. It does not reset.</li>
            <li><strong>Pending</strong> — checkouts that started but have not completed payment yet.</li>
          </ul>
        </Section>

        <Section title="Modules Sold chart">
          <p>
            A vertical bar per module type, showing every module ever created of that type across all client
            workspaces. Each type has its own color — navy for lead capture, gold for booking, green for quote
            calculator, purple for intake form — with the count above each bar and the type name below it. Use it to
            see which module types clients actually adopt.
          </p>
        </Section>

        <Section title="Est. AI cost per module type">
          <p>
            A table of each module type&apos;s count and estimated cost. Important: the AI drafting cost has no
            per-module attribution, so <em>every type is priced at the same measured average</em>. The per-type totals
            are just that average multiplied by each type&apos;s count — treat them as a rough spend picture, not a true
            per-type cost.
          </p>
        </Section>

        <Section title="Creating a client workspace">
          <div className="space-y-3">
            <Step n={1}>Fill in the <strong>New client workspace</strong> form: business name and a URL slug are required (e.g. <code>harbor-plumbing</code>).</Step>
            <Step n={2}>Add an <strong>alert email</strong> so the client gets notified of new submissions, and the <strong>website domains</strong> the modules will be embedded on (space- or comma-separated).</Step>
            <Step n={3}>Click <strong>Create workspace</strong>. It appears in the list below, where you can adjust it.</Step>
          </div>
        </Section>

        <Section title="Managing a workspace">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Save domains</strong> — update the list of sites allowed to embed this workspace&apos;s modules.</li>
            <li><strong>Invite login</strong> — send a client an owner or staff login to their own workspace dashboard.</li>
            <li><strong>Add lead capture module</strong> — creates a new module in <em>draft</em>.</li>
            <li>
              <strong>Module status</strong> — each module row has a dropdown: <em>draft</em> (not shown), <em>live</em>
              (embedded and accepting submissions), or <em>paused</em>. The embed snippet below each module is the code
              the client drops into their site.
            </li>
          </ul>
          <p className="text-xs text-gray-500">
            The badges by a workspace name (Self-serve, Install requested, Stripe status) are read-only indicators of how
            that client signed up and where their payment setup stands.
          </p>
        </Section>
      </main>
    </div>
  );
}
