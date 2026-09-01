import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/social/authGuard";
import { generateLinkedInPost } from "@/lib/social/linkedinGenerator";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { topic?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const service = createServiceClient();
  try {
    const post = await generateLinkedInPost({ topic: body.topic });
    const { data: inserted, error } = await service
      .from("linkedin_posts")
      .insert({ hook: post.hook, caption: post.caption, hashtags: post.hashtags })
      .select("*")
      .single();
    if (error || !inserted) return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });
    return NextResponse.json({ post: inserted }, { status: 201 });
  } catch (err) {
    console.error("[social/linkedin] generate failed:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
