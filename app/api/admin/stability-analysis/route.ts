import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { logAiUsage } from "@/lib/aiUsage";
import {
  computeBuildOutcomes,
  computeCanaryStats,
  computeProductStability,
  stabilityBand,
  type AppLite,
  type CanaryRunLite,
} from "@/lib/apps/productStability";
import type { StabilityAnalysis, StabilityFinding } from "@/lib/apps/stabilityAnalysisTypes";

export const runtime = "nodejs";
export const maxDuration = 60;

const ADMIN_EMAIL = "sawilliams721@gmail.com";
const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are a build-reliability engineer reviewing Vision Workx's app-generation pipeline health data. Vision Workx generates and deploys web apps for customers via an AI pipeline (intake -> Claude generates code -> validate -> deploy to Vercel), plus a synthetic "golden canary" that runs the same pipeline nightly against fixed test intakes to catch regressions before customers hit them.

You will be given a JSON summary: the canary's consecutive-clean-run streak and pass rates, real-customer build completion rates over several windows, and ranked failure reasons (tagged as coming from real customer builds or the synthetic canary). Diagnose what's actually driving the current numbers and what would move them.

Respond with ONLY a JSON object, no prose before or after, no markdown fences, in exactly this shape:
{"issues":[{"title":"short label","detail":"1-3 sentences, specific to the data given, not generic advice"}],"recommendations":[{"title":"short label","detail":"a concrete, actionable next step tied to one of the issues"}]}

Rules:
- Ground every issue in the actual numbers/failure reasons given — never invent a problem the data doesn't show.
- If a single failure reason dominates, say so explicitly and make it issue #1.
- Distinguish real customer-facing problems from canary/infra-only quirks when the data allows it.
- 2-5 issues, 2-5 recommendations. If the data genuinely looks healthy, say so plainly instead of manufacturing issues.
- This is read-only advice for a human operator — never claim you changed anything or will change anything.`;

function parseFindings(text: string): { issues: StabilityFinding[]; recommendations: StabilityFinding[] } {
  // Claude is asked for raw JSON, but strip fences defensively in case one
  // slips through — same trust-but-verify posture as the rest of this
  // pipeline's parsing (validateGenerated.ts, parseFilesSection).
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const parsed = JSON.parse(cleaned);
  const asFindings = (v: unknown): StabilityFinding[] =>
    Array.isArray(v)
      ? v
          .filter((f): f is { title?: unknown; detail?: unknown } => typeof f === "object" && f !== null)
          .map((f) => ({ title: String(f.title ?? "").trim(), detail: String(f.detail ?? "").trim() }))
          .filter((f) => f.title || f.detail)
      : [];
  return { issues: asFindings(parsed.issues), recommendations: asFindings(parsed.recommendations) };
}

export async function POST() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const since45 = new Date(Date.now() - 45 * 86_400_000).toISOString();

  const [{ data: canaryRows }, { data: appRows }] = await Promise.all([
    service
      .from("build_canary_runs")
      .select("intake_key, status, failure_reason, duration_sec, created_at")
      .gte("created_at", since45),
    service
      .from("apps")
      .select("status, failure_reason, created_at")
      .gte("created_at", since30),
  ]);

  const canaryRuns: CanaryRunLite[] = canaryRows ?? [];
  const apps: AppLite[] = appRows ?? [];

  const canaryStats = computeCanaryStats(canaryRuns);
  const buildOutcomes = computeBuildOutcomes(apps, canaryRuns);
  const productStability = computeProductStability(canaryStats, buildOutcomes);
  const pct = buildOutcomes.d30.pctComplete;
  const band = pct != null ? stabilityBand(pct) : productStability.stable ? "green" : "red";

  const inputSummary = {
    canary: {
      streak: canaryStats.streak,
      streakGoal: canaryStats.streakGoal,
      longestStreak: canaryStats.longestStreak,
      gradedBatchCount: canaryStats.gradedBatchCount,
      rate7: canaryStats.rate7,
      rate30: canaryStats.rate30,
      byKey30d: canaryStats.byKey,
    },
    realApps: {
      d7: buildOutcomes.d7,
      d30: buildOutcomes.d30,
      all: buildOutcomes.all,
    },
    topFailureReasons30d: buildOutcomes.topReasons.slice(0, 8),
    productStabilityReasons: productStability.reasons,
  };

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: JSON.stringify(inputSummary, null, 2) }],
  });

  await logAiUsage({
    source: "stability_analysis",
    model: MODEL,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  let issues: StabilityFinding[];
  let recommendations: StabilityFinding[];
  try {
    ({ issues, recommendations } = parseFindings(text));
  } catch (err) {
    console.error("[stability-analysis] failed to parse Claude's response:", err, text.slice(0, 500));
    return NextResponse.json({ error: "Claude's response wasn't valid JSON — try again" }, { status: 502 });
  }

  // $/token: same rate table as everywhere else (lib/aiUsage.ts) —
  // recompute here just to store on the row for display; logAiUsage
  // already recorded the authoritative figure in ai_usage_log.
  const RATE = { input: 3 / 1_000_000, output: 15 / 1_000_000 };
  const costUsd = message.usage.input_tokens * RATE.input + message.usage.output_tokens * RATE.output;

  const { data: row, error: insertError } = await service
    .from("stability_analyses")
    .insert({
      band,
      completion_rate_pct: pct != null ? pct * 100 : null,
      input_summary: inputSummary,
      issues,
      recommendations,
      model: MODEL,
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens,
      cost_usd: costUsd,
    })
    .select("id, created_at, band, completion_rate_pct, issues, recommendations, model, cost_usd")
    .single();

  if (insertError || !row) {
    console.error("[stability-analysis] failed to save analysis:", insertError);
    return NextResponse.json({ error: "Analysis ran but failed to save" }, { status: 500 });
  }

  const analysis: StabilityAnalysis = {
    id: row.id,
    created_at: row.created_at,
    band: row.band as StabilityAnalysis["band"],
    completion_rate_pct: row.completion_rate_pct,
    issues: (row.issues as StabilityFinding[]) ?? [],
    recommendations: (row.recommendations as StabilityFinding[]) ?? [],
    model: row.model,
    cost_usd: row.cost_usd,
  };

  return NextResponse.json({ analysis });
}
