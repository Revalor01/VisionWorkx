import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/social/authGuard";
import { generateLinkedInPost } from "@/lib/social/linkedinGenerator";
import type { LinkedInProduct } from "@/lib/database.types";
import { isPostType, rotationType, type LinkedInPostType } from "@/lib/social/linkedinRotation";

export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_PRODUCTS: LinkedInProduct[] = ["visionworkx", "proactive", "revalor_consulting", "revalor"];

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // postType: insight | story | promo; omitted = whatever this week's rotation slot calls for.
  let body: { topic?: string; product?: LinkedInProduct; postType?: LinkedInPostType };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (body.product !== undefined && !VALID_PRODUCTS.includes(body.product)) {
    return NextResponse.json({ error: "Invalid product" }, { status: 400 });
  }
  const product = body.product ?? "visionworkx";
  if (body.postType !== undefined && !isPostType(body.postType)) {
    return NextResponse.json({ error: "Invalid post type" }, { status: 400 });
  }
  const postType = body.postType ?? rotationType(new Date());

  const service = createServiceClient();
  try {
    const post = await generateLinkedInPost({ topic: body.topic, product, postType });
    const { data: inserted, error } = await service
      .from("linkedin_posts")
      .insert({ hook: post.hook, caption: post.caption, hashtags: post.hashtags, product })
      .select("*")
      .single();
    if (error || !inserted) return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });
    return NextResponse.json({ post: inserted }, { status: 201 });
  } catch (err) {
    console.error("[social/linkedin] generate failed:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
