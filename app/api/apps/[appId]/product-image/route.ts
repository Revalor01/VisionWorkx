import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";

// Storefront: the generated app's admin uploads product/variant images
// here (never straight to Supabase Storage — keeps isolation on the
// platform). Server-to-server, authed by the app's own APP_CHECKOUT_SECRET
// (same secret the checkout route uses), injected at deploy time.
const BUCKET = "product-images";
const MAX_BYTES = 5 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

async function authedApp(appId: string, req: NextRequest) {
  const secret = req.headers.get("x-vw-checkout-secret") ?? "";
  if (!secret) return null;
  const service = createServiceClient();
  const { data: app } = await service
    .from("apps")
    .select("id, checkout_secret")
    .eq("id", appId)
    .single();
  if (!app || !app.checkout_secret || app.checkout_secret !== secret) return null;
  return app;
}

// POST multipart/form-data with a `file` field → { url } (a public URL).
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ appId: string }> },
) {
  const { appId } = await props.params;
  const app = await authedApp(appId, req);
  if (!app) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const ext = EXT[file.type];
  if (!ext) {
    return NextResponse.json({ error: "PNG, JPG or WebP only" }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Max 5 MB" }, { status: 413 });
  }

  const path = `app_${appId.slice(0, 8)}/${randomUUID()}.${ext}`;
  const service = createServiceClient();
  const { error } = await service.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    console.error("[product-image] upload failed:", error.message);
    return NextResponse.json({ error: "Upload failed" }, { status: 502 });
  }

  const { data } = service.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
