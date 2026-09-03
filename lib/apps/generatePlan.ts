// Phase 6: two-pass generation. Before writing ~100KB of code in one
// stream, a cheap first pass commits to a file manifest and schema. Pass 2
// implements exactly that plan, and validateGenerated cross-checks the
// finished output against the planned file list — a dropped file that
// isn't a truncation now gets caught and repaired.

import Anthropic from "@anthropic-ai/sdk";
import { logAiUsage } from "@/lib/aiUsage";
import type { IntakeData } from "@/lib/database.types";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4000;

const SYSTEM_PROMPT = `You are planning (NOT building) a Next.js 14 App Router + Supabase app for a non-technical small business.

Output a concise build plan in exactly these three sections — no code, no prose outside them:

## Files
One full path per line, every file the implementation will create. Always include: app/layout.tsx, app/page.tsx, app/login/page.tsx, lib/supabase.ts, lib/supabase-server.ts, .env.local.example, supabase/migrations/001_init.sql, README.md. Then the category-specific pages, dynamic route pages (app/…/[id]/page.tsx), API routes, and components. 15–40 files is typical.

## Schema
Each table name followed by its important columns (type). Include a customer contact email/phone column wherever the automations need one. Note that the migration will also define the platform views vw_metrics_daily and vw_automation_due.

## Notes
2–5 short lines: the auth model, which pages are public vs admin, whether payments apply, anything non-obvious.`;

export interface GenerationPlan {
  /** The full plan text, injected verbatim into the implementation prompt. */
  text: string;
  /** File paths parsed from the "## Files" section, for a completeness check. */
  files: string[];
}

function categoryDescription(category: string): string {
  return (
    (
      {
        booking: "booking and appointment scheduling system",
        crm: "customer relationship management (CRM) system",
        inventory: "inventory and order management system",
        portal: "client portal with document sharing and messaging",
        invoicing: "invoicing and quote management system",
        membership: "membership and recurring billing management system",
      } as Record<string, string>
    )[category] ?? category
  );
}

export function __parseFilesSection(plan: string): string[] {
  return parseFilesSection(plan);
}

function parseFilesSection(plan: string): string[] {
  const m = plan.match(/##\s*Files\s*\n([\s\S]*?)(?:\n##\s|\s*$)/i);
  if (!m) return [];
  return m[1]
    .split("\n")
    .map((l) => l.replace(/^[-*\d.\s]+/, "").trim())
    .filter((l) => /\.[a-z]+$/i.test(l) && !l.includes(" "))
    .map((l) => l.replace(/^\/+/, ""));
}

export async function generatePlan(intake: IntakeData): Promise<GenerationPlan> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const user = [
    `Business: ${intake.businessName} — ${intake.businessType}${intake.location ? ` (${intake.location})` : ""}`,
    intake.description ? `What they need: ${intake.description}` : "",
    `App type: a ${categoryDescription(intake.category)}`,
    intake.features.length ? `Requested features:\n${intake.features.map((f) => `- ${f}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: user }],
  });
  const message = await stream.finalMessage();

  await logAiUsage({
    source: "app_generate_plan",
    model: MODEL,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  return { text, files: parseFilesSection(text) };
}
