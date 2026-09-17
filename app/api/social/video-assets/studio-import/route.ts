import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdminOrEditor } from "@/lib/social/authGuard";
import type { SocialVideoProduct } from "@/lib/database.types";

export const runtime = "nodejs";

const BUCKET = "social-video-assets";
// Matches lib/social/videoOutro.ts's BRAND_LOGOS keys.
const OUTRO_APPS = [
  "VisionWorkx", "Revalor Kids", "Revalor Wellness", "Revalor LLC",
  "Chorebit", "FeelFlow", "MindBit", "Sanctum", "Proactive", "Revalor Consulting",
];
const PRODUCTS: SocialVideoProduct[] = [
  "visionworkx", "proactive", "revalor_consulting", "chorebit", "feelflow", "mindbit", "sanctum", "revalor",
];

// Media Studio's "Import" flow, step 1: a video made on another platform
// doesn't need generating, just tagging and a place to land. Mirrors
// video-assets/route.ts's raw-upload POST (signed URL, browser uploads
// directly to Storage - clips can be well over what a Vercel function body
// can proxy) but is its own route rather than a modification to that shared
// one, so VideoTab.tsx's existing manual-upload flow is untouched. The row
// starts as origin: "studio", status: "raw"; apply-outro/route.ts finishes
// the job once the browser upload completes.
export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!(await isAdminOrEditor(user))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const brandId: string | undefined = body?.brandId;
  const filename: string | undefined = body?.filename;
  const outroApp: string = body?.outroApp || "none";
  const product: string | undefined = body?.product;

  if (!brandId) return NextResponse.json({ error: "brandId is required" }, { status: 400 });
  if (!filename) return NextResponse.json({ error: "filename is required" }, { status: 400 });
  if (outroApp !== "none" && !OUTRO_APPS.includes(outroApp)) {
    return NextResponse.json({ error: `outroApp must be one of: none, ${OUTRO_APPS.join(", ")}` }, { status: 400 });
  }
  if (!product || !(PRODUCTS as string[]).includes(product)) {
    return NextResponse.json({ error: `product must be one of: ${PRODUCTS.join(", ")}` }, { status: 400 });
  }
  const validatedProduct = product as SocialVideoProduct;

  const service = createServiceClient();
  const { data: brand } = await service.from("social_brands").select("id").eq("id", brandId).maybeSingle();
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const assetId = crypto.randomUUID();
  const ext = filename.split(".").pop() || "mp4";
  const path = `${brandId}/studio-import/${assetId}.${ext}`;

  const { data: signed, error: signError } = await service.storage.from(BUCKET).createSignedUploadUrl(path);
  if (signError) return NextResponse.json({ error: signError.message }, { status: 500 });

  const { data: asset, error: insertError } = await service
    .from("social_video_assets")
    .insert({
      id: assetId,
      brand_id: brandId,
      raw_path: path,
      status: "raw",
      // Prefixed so StudioTab/LinkedInTab can pull the original filename
      // back out to label the video with — with two imports of the same
      // product there's otherwise nothing distinguishing them by name.
      notes: `Imported: ${filename}`,
      origin: "studio",
      studio_outro_app: outroApp,
      studio_product: validatedProduct,
    })
    .select("*")
    .single();
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json(
    { asset, uploadUrl: signed.signedUrl, uploadToken: signed.token, path },
    { status: 201 }
  );
}
