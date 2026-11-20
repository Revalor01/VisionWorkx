import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/social/authGuard";
import { LINKEDIN_IMAGE_BUCKET, LINKEDIN_IMAGE_MAX_BYTES, LINKEDIN_IMAGE_TYPES, linkedinImagePrefix } from "@/lib/social/linkedinImage";

// Admin-only: a one-time signed upload link for a LinkedIn post's image.
// The browser uploads straight to storage, then PATCHes the post with the
// returned path (the PATCH route checks it's in this post's folder).

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { contentType?: string; size?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ext = body.contentType ? LINKEDIN_IMAGE_TYPES[body.contentType] : undefined;
  if (!ext) return NextResponse.json({ error: "Use a JPG or PNG image" }, { status: 400 });
  if (typeof body.size === "number" && body.size > LINKEDIN_IMAGE_MAX_BYTES) {
    return NextResponse.json({ error: "Image must be 5 MB or smaller" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: post } = await service.from("linkedin_posts").select("id").eq("id", params.id).maybeSingle();
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const path = `${linkedinImagePrefix(params.id)}${randomUUID()}.${ext}`;
  const { data: signed, error } = await service.storage.from(LINKEDIN_IMAGE_BUCKET).createSignedUploadUrl(path);
  if (error) {
    console.error("[social/linkedin/image] storage link failed:", params.id, error.message);
    return NextResponse.json({ error: "Couldn't create the image link. Try again." }, { status: 500 });
  }

  return NextResponse.json({ path, uploadToken: signed.token });
}
