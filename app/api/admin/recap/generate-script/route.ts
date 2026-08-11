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

    // week_start already has its own column — don't duplicate it inside
    // the stats blob, or client code that does Object.entries(stats) to
    // render per-product cards ends up iterating a date string char by
    // char as if it were an object.
    const { weekStart, ...statsByProduct } = stats;

    const service = createServiceClient();
    const { data, error } = await service
      .from("weekly_recaps")
      .upsert(
        {
          week_start: weekStart,
          stats: statsByProduct as unknown as Record<string, unknown>,
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
