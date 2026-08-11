import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { isAdminRequest } from "@/lib/social/adminAuth";
import { computeWeeklyStats } from "@/lib/social/weeklyStats";
import { generateRecapScript } from "@/lib/social/recapScript";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const stats = await computeWeeklyStats();
    const { script, videoPrompt } = await generateRecapScript(stats);

    const service = createServiceClient();
    const { data, error } = await service
      .from("weekly_recaps")
      .upsert(
        {
          week_start: stats.weekStart,
          stats: stats as unknown as Record<string, unknown>,
          script,
          video_prompt: videoPrompt,
          status: "draft",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "week_start" }
      )
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ recap: data });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
