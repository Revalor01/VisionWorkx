import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/social/authGuard";
import type { Database, LinkedInPostStatus } from "@/lib/database.types";

type LinkedInPostUpdate = Database["public"]["Tables"]["linkedin_posts"]["Update"];

const VALID_STATUSES: LinkedInPostStatus[] = ["draft", "approved", "posted"];

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { hook?: string; caption?: string; hashtags?: string[]; status?: LinkedInPostStatus; videoAssetId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: LinkedInPostUpdate = { updated_at: new Date().toISOString() };
  if (body.hook !== undefined) update.hook = body.hook;
  if (body.caption !== undefined) update.caption = body.caption;
  if (body.hashtags !== undefined) update.hashtags = body.hashtags;
  if (body.videoAssetId !== undefined) update.video_asset_id = body.videoAssetId;
  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    update.status = body.status;
    if (body.status === "posted") update.posted_at = new Date().toISOString();
  }

  const service = createServiceClient();
  const { data, error } = await service.from("linkedin_posts").update(update).eq("id", params.id).select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  return NextResponse.json({ post: data });
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { error } = await service.from("linkedin_posts").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
