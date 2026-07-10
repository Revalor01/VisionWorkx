import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdminOrEditor } from "@/lib/social/authGuard";
import type { Database, SocialVideoStatus } from "@/lib/database.types";

type AssetUpdate = Database["public"]["Tables"]["social_video_assets"]["Update"];

const VALID_STATUSES: SocialVideoStatus[] = ["raw", "in_editing", "ready", "posted"];

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!(await isAdminOrEditor(user))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { status?: SocialVideoStatus; notes?: string; finalPath?: string; editorEmail?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: AssetUpdate = { updated_at: new Date().toISOString() };
  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    update.status = body.status;
  }
  if (body.notes !== undefined) update.notes = body.notes;
  if (body.finalPath !== undefined) update.final_path = body.finalPath;
  if (body.editorEmail !== undefined) update.editor_email = body.editorEmail;

  const service = createServiceClient();
  const { data, error } = await service
    .from("social_video_assets")
    .update(update)
    .eq("id", params.id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
