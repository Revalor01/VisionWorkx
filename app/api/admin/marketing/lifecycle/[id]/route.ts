import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/social/adminAuth";
import { getLifecycleTrigger, type LifecycleTriggerId } from "@/lib/lifecycle/triggers";
import type { MarketingAutonomy } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    getLifecycleTrigger(params.id as LifecycleTriggerId);
  } catch {
    return NextResponse.json({ error: "Unknown trigger" }, { status: 404 });
  }

  let body: { active?: boolean; autonomy?: MarketingAutonomy };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: { trigger_id: string; active?: boolean; autonomy?: MarketingAutonomy; updated_at: string } = {
    trigger_id: params.id,
    updated_at: new Date().toISOString(),
  };
  if (typeof body.active === "boolean") update.active = body.active;
  if (body.autonomy === "manual" || body.autonomy === "auto") update.autonomy = body.autonomy;

  const service = createServiceClient();
  // upsert-as-merge: a key omitted from `update` keeps its existing value
  // on conflict rather than resetting to the column default, so toggling
  // `active` alone doesn't clobber a previously-set `autonomy` and vice versa.
  const { error } = await service.from("lifecycle_trigger_settings").upsert(update, { onConflict: "trigger_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
