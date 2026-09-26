import { NextRequest, NextResponse } from "next/server";
import { modulesConfigured, modulesServerClient, modulesServiceClient } from "@/lib/modules/supabase";
import { UPLOAD_BUCKET } from "@/lib/modules/constants";

// Members open a file a customer attached. The submission is read with the
// member's own session (RLS: only their workspace), then a 5-minute signed
// download link is issued for exactly that file.
export async function GET(req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  if (!modulesConfigured()) return NextResponse.json({ error: "Not available" }, { status: 503 });
  const submissionId = req.nextUrl.searchParams.get("submission") ?? "";
  const field = req.nextUrl.searchParams.get("field") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(submissionId) || !/^[a-z][a-z0-9_]{0,39}$/.test(field)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const supabase = await modulesServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/workspace/login?next=/workspace/${slug}`, req.url));

  const { data: sub } = await supabase.from("vw_submissions").select("data").eq("id", submissionId).maybeSingle();
  const fv = (sub?.data as Record<string, unknown> | undefined)?.[field] as { path?: string; name?: string } | undefined;
  if (!fv?.path) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await modulesServiceClient()
    .storage.from(UPLOAD_BUCKET)
    .createSignedUrl(fv.path, 300, { download: fv.name ?? true });
  if (error || !data) return NextResponse.json({ error: "Couldn't open the file." }, { status: 500 });
  return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
