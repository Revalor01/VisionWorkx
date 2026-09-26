import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/modules/ownerApi";
import { modulesServiceClient } from "@/lib/modules/supabase";
import { onboardingEmailOnce, sendInstallRequest } from "@/lib/modules/selfServe";

// "Have Revalor install it": flags the workspace and emails the Revalor team.
export async function POST(req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const auth = await requireOwner(slug);
  if ("error" in auth) return auth.error;

  const db = modulesServiceClient();
  const { data: ws } = await db.from("vw_workspaces").select("install_requested_at").eq("id", auth.workspace.id).single();
  if (!ws?.install_requested_at) {
    await db.from("vw_workspaces").update({ install_requested_at: new Date().toISOString() }).eq("id", auth.workspace.id);
  }
  await onboardingEmailOnce(auth.workspace.id, "install_request", () =>
    sendInstallRequest({ name: auth.workspace.name, slug, ownerEmail: auth.user.email ?? "", domains: auth.workspace.domains ?? [] }),
  );
  return NextResponse.json({ ok: true });
}
