import { createServiceClient } from "@/lib/supabase";

// $/token rate table — from Anthropic's published per-model pricing.
// cost_usd is computed once at log time and stored, not recalculated from
// this table later, so a future price change doesn't rewrite history.
const RATES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3 / 1_000_000, output: 15 / 1_000_000 },
};

// One tag per direct-Anthropic-call site across the ecosystem — see each
// call site for what it does. Shared with revalor-admin's copy of this file.
export type AiUsageSource =
  | "app_generate"
  | "app_generate_plan"
  | "app_edit"
  | "app_deploy_repair"
  | "promote_copy"
  | "blog_content"
  | "social_classify_inbound"
  | "social_content_generate"
  | "social_recap_script"
  | "linkedin_post_generate"
  | "marketing_email"
  | "mobile_push"
  | "mobile_sms"
  | "content_engine_source"
  | "outreach_group_post";

// Fire-and-forget-shaped but awaited by callers (not detached) — a
// serverless function can be frozen/killed right after it returns, so a
// truly detached background write could get dropped.
export async function logAiUsage(params: {
  source: AiUsageSource;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  const rate = RATES[params.model];
  const costUsd = rate ? params.inputTokens * rate.input + params.outputTokens * rate.output : null;

  const service = createServiceClient();
  const { error } = await service.from("ai_usage_log").insert({
    source: params.source,
    model: params.model,
    input_tokens: params.inputTokens,
    output_tokens: params.outputTokens,
    cost_usd: costUsd,
  });

  if (error) console.error("[aiUsage] failed to log usage:", error);
}
