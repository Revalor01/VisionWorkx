import { NextRequest, NextResponse } from "next/server";
import { modulesConfigured, modulesServerClient } from "@/lib/modules/supabase";
import { toCsv } from "@/lib/modules/csv";

// CSV of a workspace's submissions. Uses the member's own session, so RLS
// guarantees nobody can export another workspace's data.
export async function GET(req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  if (!modulesConfigured()) return NextResponse.json({ error: "Not available" }, { status: 503 });
  const supabase = await modulesServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/workspace/login", req.url));

  const { data: ws } = await supabase.from("vw_workspaces").select("id, slug").eq("slug", slug).maybeSingle();
  if (!ws) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [{ data: subs }, { data: mods }] = await Promise.all([
    supabase
      .from("vw_submissions")
      .select("created_at, module_id, status, notes, source_url, data")
      .eq("workspace_id", ws.id)
      .order("created_at", { ascending: false })
      .limit(10000),
    supabase.from("vw_modules").select("id, name").eq("workspace_id", ws.id),
  ]);
  const names: Record<string, string> = {};
  (mods ?? []).forEach((m) => (names[m.id] = m.name));
  const rows = subs ?? [];
  const keys = [...new Set(rows.flatMap((r) => Object.keys((r.data ?? {}) as Record<string, string>)))];
  const header = ["received_at", "module", "status", ...keys, "notes", "page"];
  const body = toCsv(
    header,
    rows.map((r) => {
      const d = (r.data ?? {}) as Record<string, string>;
      return [r.created_at, names[r.module_id] ?? "", r.status, ...keys.map((k) => d[k] ?? ""), r.notes, r.source_url ?? ""];
    }),
  );
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ws.slug}-submissions-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
