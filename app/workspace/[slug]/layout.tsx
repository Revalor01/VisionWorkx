import type { Metadata } from "next";
import Link from "next/link";
import { requireWorkspace } from "@/lib/modules/workspace";
import SetupChecklist from "@/components/modules/SetupChecklist";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "VisionWorkx workspace", robots: { index: false, follow: false } };

export default async function WorkspaceLayout(props: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const { workspace, role, user } = await requireWorkspace(slug);
  const base = `/workspace/${workspace.slug}`;
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">VisionWorkx workspace</p>
            <p className="font-bold text-navy-dark">{workspace.name}</p>
          </div>
          <nav className="flex items-center gap-1 text-sm" aria-label="Workspace">
            <Link href={base} className="rounded-lg px-3 py-2 font-medium text-gray-700 hover:bg-gray-100">Submissions</Link>
            <Link href={`${base}/modules`} className="rounded-lg px-3 py-2 font-medium text-gray-700 hover:bg-gray-100">Modules &amp; install</Link>
            <Link href={`${base}/emails`} className="rounded-lg px-3 py-2 font-medium text-gray-700 hover:bg-gray-100">Emails</Link>
            <Link href={`${base}/billing`} className="rounded-lg px-3 py-2 font-medium text-gray-700 hover:bg-gray-100">Billing</Link>
            {role === "owner" && (
              <Link href={`${base}/settings`} className="rounded-lg px-3 py-2 font-medium text-gray-700 hover:bg-gray-100">Settings</Link>
            )}
            <form action="/workspace/signout" method="post">
              <button className="rounded-lg px-3 py-2 text-gray-500 hover:bg-gray-100" title={user.email ?? ""}>Sign out</button>
            </form>
          </nav>
        </div>
      </header>
      <SetupChecklist workspaceId={workspace.id} slug={workspace.slug} isOwner={role === "owner"} />
      <main className="mx-auto max-w-6xl px-4 py-8">{props.children}</main>
    </div>
  );
}
