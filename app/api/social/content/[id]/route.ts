import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/social/authGuard";
import type { Database, SocialContentStatus } from "@/lib/database.types";

type ContentUpdate = Database["public"]["Tables"]["social_content"]["Update"];

const VALID_STATUSES: SocialContentStatus[] = ["draft", "approved", "scheduled", "posted", "failed"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    caption?: string;
    hook?: string;
    hashtags?: string[];
    status?: SocialContentStatus;
    scheduledAt?: string;
    videoAssetId?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: ContentUpdate = { updated_at: new Date().toISOString() };
  if (body.caption !== undefined) update.caption = body.caption;
  if (body.hook !== undefined) update.hook = body.hook;
  if (body.hashtags !== undefined) update.hashtags = body.hashtags;
  if (body.videoAssetId !== undefined) update.video_asset_id = body.videoAssetId;
  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    if (body.status === "scheduled" && !body.scheduledAt) {
      return NextResponse.json({ error: "scheduledAt required to schedule a post" }, { status: 400 });
    }
    update.status = body.status;
  }
  if (body.scheduledAt !== undefined) update.scheduled_at = body.scheduledAt;

  const service = createServiceClient();
  const { data, error } = await service
    .from("social_content")
    .update(update)
    .eq("id", params.id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Content not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { error } = await service.from("social_content").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
