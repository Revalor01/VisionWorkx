import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/social/adminAuth";
import type { Database } from "@/lib/database.types";

type RecapUpdate = Database["public"]["Tables"]["weekly_recaps"]["Update"];

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { script?: string; videoPrompt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: RecapUpdate = { updated_at: new Date().toISOString() };
  if (body.script !== undefined) update.script = body.script;
  if (body.videoPrompt !== undefined) update.video_prompt = body.videoPrompt;

  const service = createServiceClient();
  const { error } = await service.from("weekly_recaps").update(update).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
