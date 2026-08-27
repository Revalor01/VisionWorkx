import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/social/adminAuth";
import { LIFECYCLE_TRIGGERS } from "@/lib/lifecycle/triggers";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: settingsRows, error: settingsError }, { data: fireRows, error: fireError }] = await Promise.all([
    service.from("lifecycle_trigger_settings").select("*"),
    service.from("lifecycle_fires").select("trigger_id").gte("created_at", since),
  ]);
  if (settingsError) return NextResponse.json({ error: settingsError.message }, { status: 500 });
  if (fireError) return NextResponse.json({ error: fireError.message }, { status: 500 });

  const settingsByTrigger = new Map((settingsRows ?? []).map((s) => [s.trigger_id, s]));
  const fireCounts = new Map<string, number>();
  for (const row of fireRows ?? []) fireCounts.set(row.trigger_id, (fireCounts.get(row.trigger_id) ?? 0) + 1);

  const triggers = LIFECYCLE_TRIGGERS.map((t) => {
    const settings = settingsByTrigger.get(t.id);
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      products: t.products,
      channels: t.channels,
      active: settings?.active ?? true,
      autonomy: settings?.autonomy ?? t.defaultAutonomy,
      recentFireCount: fireCounts.get(t.id) ?? 0,
    };
  });

  return NextResponse.json({ triggers });
}
