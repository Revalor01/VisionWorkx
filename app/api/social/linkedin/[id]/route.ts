import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/social/authGuard";
import type { Database, LinkedInPostStatus } from "@/lib/database.types";
import { LINKEDIN_IMAGE_BUCKET, LINKEDIN_IMAGE_MAX_BYTES, LINKEDIN_IMAGE_TYPES, isLinkedinImagePath } from "@/lib/social/linkedinImage";

type LinkedInPostUpdate = Database["public"]["Tables"]["linkedin_posts"]["Update"];

const VALID_STATUSES: LinkedInPostStatus[] = ["draft", "approved", "posted"];

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    hook?: string;
    caption?: string;
    hashtags?: string[];
    status?: LinkedInPostStatus;
    videoAssetId?: string | null;
    // ISO timestamp to schedule (approved posts only), or null to unschedule.
    scheduledAt?: string | null;
    // Path returned by image-upload-url (must be in this post's folder), or null to remove.
    imagePath?: string | null;
  };
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
  if (body.imagePath !== undefined) {
    if (body.imagePath !== null && (typeof body.imagePath !== "string" || !isLinkedinImagePath(params.id, body.imagePath))) {
      return NextResponse.json({ error: "Invalid image" }, { status: 400 });
    }
    update.image_path = body.imagePath;
  }
  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    update.status = body.status;
    if (body.status === "posted") update.posted_at = new Date().toISOString();
    // Back to draft = no longer cleared to go out, so drop any schedule.
    if (body.status === "draft") update.scheduled_at = null;
  }

  const service = createServiceClient();

  // The signed upload link doesn't pin size or type, so check the stored file
  // itself: it must exist, be 5 MB or less, and be a JPG/PNG matching its name.
  if (typeof update.image_path === "string") {
    const { data: info, error: infoError } = await service.storage.from(LINKEDIN_IMAGE_BUCKET).info(update.image_path);
    if (infoError || !info) return NextResponse.json({ error: "The image upload didn't finish. Try again." }, { status: 400 });
    const ext = update.image_path.split(".").pop();
    const typeOk = !!info.contentType && LINKEDIN_IMAGE_TYPES[info.contentType] === ext;
    const sizeOk = typeof info.size !== "number" || info.size <= LINKEDIN_IMAGE_MAX_BYTES;
    if (!typeOk || !sizeOk) {
      return NextResponse.json({ error: "Use a JPG or PNG image of 5 MB or less" }, { status: 400 });
    }
  }

  if (body.scheduledAt !== undefined) {
    if (body.scheduledAt === null) {
      update.scheduled_at = null;
    } else {
      const t = typeof body.scheduledAt === "string" ? Date.parse(body.scheduledAt) : NaN;
      if (Number.isNaN(t)) return NextResponse.json({ error: "Invalid scheduled time" }, { status: 400 });
      // Only an approved post can be scheduled: scheduling is what sends it to
      // the Zapier feed, so it must already have passed human review.
      const { data: current, error: readError } = await service
        .from("linkedin_posts")
        .select("status")
        .eq("id", params.id)
        .maybeSingle();
      if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
      if (!current) return NextResponse.json({ error: "Post not found" }, { status: 404 });
      const effectiveStatus = body.status ?? current.status;
      if (effectiveStatus !== "approved") {
        return NextResponse.json({ error: "Approve the post before scheduling it" }, { status: 400 });
      }
      update.scheduled_at = new Date(t).toISOString();
    }
  }
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
