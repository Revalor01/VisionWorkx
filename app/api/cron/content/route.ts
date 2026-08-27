import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { generateSourceDraft } from "@/lib/content/generator";
import { PRODUCT_LABEL } from "@/lib/marketing/products";
import { computeNextRun } from "@/lib/marketing/recurrence";

export const runtime = "nodejs";
export const maxDuration = 120;

// Only creates the source content_items row when a content_topics entry
// comes due — derivative generation stays a deliberate, reviewed step in
// the Content UI (lib/content/repurpose.ts), not something this cron
// fires off across every channel unattended.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const now = new Date();

  const { data: dueTopics, error: dueError } = await service
    .from("content_topics")
    .select("*")
    .eq("active", true)
    .neq("cadence", "on_demand")
    .lte("next_run_at", now.toISOString());
  if (dueError) return NextResponse.json({ error: dueError.message }, { status: 500 });

  const results: { topicId: string; outcome: "created" | "failed" }[] = [];

  for (const topic of dueTopics ?? []) {
    try {
      const draft = await generateSourceDraft({
        productLabel: PRODUCT_LABEL[topic.product],
        topic: topic.topic,
        keywordCluster: topic.keyword_cluster,
      });
      await service.from("content_items").insert({
        product: topic.product,
        source_type: "update",
        title: draft.title,
        body: draft.body,
        keyword_cluster: topic.keyword_cluster,
        status: "ready",
      });
      results.push({ topicId: topic.id, outcome: "created" });
    } catch (err) {
      console.error(`[cron/content] failed for topic ${topic.id}:`, err);
      results.push({ topicId: topic.id, outcome: "failed" });
    }

    const nextRunAt = computeNextRun(
      { recurrence: topic.cadence === "monthly" ? "monthly" : "weekly", dayOfWeek: topic.day_of_week, dayOfMonth: topic.day_of_month, hourUtc: topic.hour_utc },
      now
    );
    await service.from("content_topics").update({ next_run_at: nextRunAt.toISOString(), updated_at: now.toISOString() }).eq("id", topic.id);
  }

  return NextResponse.json({ results });
}
