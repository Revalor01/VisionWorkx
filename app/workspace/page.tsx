import { redirect } from "next/navigation";
import Link from "next/link";
import { modulesConfigured, modulesServerClient } from "@/lib/modules/supabase";

export const dynamic = "force-dynamic";
export const metadata = { title: "VisionWorkx workspace", robots: { index: false, follow: false } };

export default async function WorkspaceIndex() {
  if (!modulesConfigured()) redirect("/workspace/login");
  const supabase = await modulesServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/workspace/login");

  const { data: rows } = await supabase
    .from("vw_workspace_members")
    .select("role, vw_workspaces!inner(name, slug)")
    .eq("user_id", user.id);
  const list = (rows ?? []).map((r) => {
    const ws = (Array.isArray(r.vw_workspaces) ? r.vw_workspaces[0] : r.vw_workspaces) as { name: string; slug: string };
    return { ...ws, role: r.role as string };
  });
  if (list.length === 1) redirect(`/workspace/${list[0].slug}`);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-16">
      <div className="mx-auto max-w-lg rounded-2xl border border-gray-200 bg-white p-8">
        <h1 className="mb-4 text-2xl font-bold text-navy-dark">Your workspaces</h1>
        {list.length === 0 ? (
          <p className="text-gray-600">
            You&apos;re signed in as {user.email}, but you haven&apos;t been added to a workspace yet. Ask your Revalor
            contact to invite you.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {list.map((w) => (
              <li key={w.slug}>
                <Link href={`/workspace/${w.slug}`} className="flex justify-between py-3 font-medium text-navy hover:underline">
                  {w.name} <span className="text-sm text-gray-500">{w.role}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <form action="/workspace/signout" method="post" className="mt-6">
          <button className="text-sm text-gray-500 hover:text-gray-800">Sign out</button>
        </form>
      </div>
    </main>
  );
}
