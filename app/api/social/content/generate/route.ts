import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/social/authGuard";
import { generateContentCalendar } from "@/lib/social/contentGenerator";
import type { SocialPlatform } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 120;

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const rateLimitHits = new Map<string, number[]>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const hits = (rateLimitHits.get(key) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= RATE_LIMIT_MAX) {
    rateLimitHits.set(key, hits);
    return false;
  }
  hits.push(now);
  rateLimitHits.set(key, hits);
  return true;
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!checkRateLimit(user!.id)) {
    return NextResponse.json({ error: "Rate limit exceeded — try again in a minute" }, { status: 429 });
  }

  let body: { brandId?: string; platforms?: SocialPlatform[]; postCount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { brandId, platforms, postCount } = body;
  if (!brandId || !Array.isArray(platforms) || platforms.length === 0 || !postCount) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: brand } = await service.from("social_brands").select("*").eq("id", brandId).maybeSingle();
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  try {
    const posts = await generateContentCalendar({
      brandName: brand.name,
      voiceNotes: brand.voice_notes,
      platforms,
      postCount,
    });

    const rows = posts.map((p) => ({
      brand_id: brandId,
      platform: p.platform,
      hook: p.hook,
      caption: p.caption,
      hashtags: p.hashtags,
      status: "draft" as const,
    }));

    const { data: inserted, error } = await service.from("social_content").insert(rows).select("*");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ content: inserted }, { status: 201 });
  } catch (err) {
    console.error("[social/content/generate]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
