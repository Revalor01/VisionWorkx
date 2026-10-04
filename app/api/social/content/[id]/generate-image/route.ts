import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/social/authGuard";
import { generateAndSavePostImage } from "@/lib/social/postImage";

export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { data: post } = await service.from("social_content").select("*").eq("id", params.id).maybeSingle();
  if (!post) return NextResponse.json({ error: "Content not found" }, { status: 404 });

  try {
    const image = await generateAndSavePostImage(service, post);
    return NextResponse.json({ ok: true, imagePath: image.path, dataUrl: `data:${image.mediaType};base64,${image.base64}` });
  } catch (err) {
    const message = (err as Error).message;
    return NextResponse.json({ error: message }, { status: message === "Brand not found" ? 404 : 500 });
  }
}
