import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/social/authGuard";
import { publishPost } from "@/lib/social/publishPost";

export const runtime = "nodejs";
export const maxDuration = 120;

// Manual "Post now" button — publishes immediately instead of waiting on
// the 10-minute cron (app/api/cron/social-publish). Shares the same
// publish logic via lib/social/publishPost.
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: post } = await service.from("social_content").select("*").eq("id", params.id).maybeSingle();
  if (!post) return NextResponse.json({ error: "Content not found" }, { status: 404 });
  if (post.status === "posted") return NextResponse.json({ error: "Already posted" }, { status: 400 });

  const result = await publishPost(service, post);
  if (!result.ok) return NextResponse.json({ error: result.error ?? "Publish failed" }, { status: 500 });

  const { data: updated } = await service.from("social_content").select("*").eq("id", params.id).maybeSingle();
  return NextResponse.json({ ok: true, content: updated });
}
