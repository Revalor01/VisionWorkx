import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/social/authGuard";
import { findBrand, validateCampaign } from "@/lib/social/campaignImport";
import type { Database } from "@/lib/database.types";

type ContentInsert = Database["public"]["Tables"]["social_content"]["Insert"];

// Imports finished posts (e.g. the AI quiz campaign) into social_content.
// Body: { brand, autoImages?: "instagram" | "all" | "none", posts: [{ platform, caption, hook?, hashtags?, linkUrl?, scheduledAt }] }.
// ?dry=1 validates and returns the preview without saving.
export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = validateCampaign(body);
  if (!result.ok) return NextResponse.json({ error: "Fix these and try again", errors: result.errors }, { status: 400 });

  const service = createServiceClient();
  const { data: brands, error: brandError } = await service.from("social_brands").select("id, name, slug");
  if (brandError) return NextResponse.json({ error: brandError.message }, { status: 500 });
  const brand = findBrand(brands ?? [], result.brand);
  if (!brand) return NextResponse.json({ error: `No Social brand named "${result.brand}"` }, { status: 400 });

  if (req.nextUrl.searchParams.get("dry") === "1") {
    return NextResponse.json({ brand: brand.name, autoImages: result.autoImages, posts: result.posts });
  }

  const rows: ContentInsert[] = result.posts.map((p) => ({
    brand_id: brand.id,
    platform: p.platform,
    caption: p.caption,
    hook: p.hook,
    hashtags: p.hashtags,
    link_url: p.linkUrl,
    scheduled_at: p.scheduledAt,
    status: p.status,
    generated_by: "manual",
    auto_image: p.autoImage,
  }));
  const { data, error } = await service.from("social_content").insert(rows).select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ brand: brand.name, content: data ?? [] });
}
