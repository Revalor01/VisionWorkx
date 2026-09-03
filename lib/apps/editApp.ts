// The change engine: take a deployed app's current source and a customer's
// plain-English request, return the minimal set of files to add/change/
// delete plus a one-line changelog. Phase 1 of "Closing the Builder Loop".
//
// This is deliberately a targeted edit, not a regeneration: the full
// current source goes in as context, and Claude is asked to emit only what
// it touches. The processor route merges the result onto the current file
// map and ships it through the normal deploy pipeline.

import Anthropic from "@anthropic-ai/sdk";
import { logAiUsage } from "@/lib/aiUsage";
import {
  diffFileMaps,
  mergeFileMap,
  serializeFileMap,
  parseFileMap,
  type FileMap,
} from "@/lib/apps/fileMap";
import type { AppCategory } from "@/lib/database.types";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 20_000;

const SYSTEM_PROMPT = `You are modifying an EXISTING, deployed Next.js 14 (App Router) + Supabase web app for a non-technical small-business owner. You are given the app's complete current source and one change request.

OUTPUT FORMAT — output ONLY this, nothing else:
- For every file you add or change, a full-contents block (never a diff, never a partial file):
[FILENAME: path/to/file.tsx]
<the entire new contents of that file>
[/FILENAME]
- To remove a file, a single line: [DELETE: path/to/file.tsx]
- Exactly one final line: [CHANGELOG] <one past-tense sentence describing what changed>

Do NOT emit a block for any file you are not changing. Do NOT write any prose, explanation, or markdown outside the blocks.

RULES
1. Make the smallest change that satisfies the request. Do not refactor, rename, restyle, or "improve" unrelated code.
2. Keep the existing stack and conventions: Next.js 14 App Router, TypeScript, @supabase/ssr, Tailwind. Match the surrounding file's style.
3. Styling: use the existing Tailwind classes and the \`primary\` / \`background\` theme tokens (e.g. \`bg-primary\`, \`text-primary/80\`, \`bg-background\`). NEVER hardcode a hex color or a \`bg-[#...]\` arbitrary value — the owner controls brand colors at runtime.
4. Do NOT modify \`tailwind.config.*\`, \`lib/supabase.ts\`, \`lib/supabase-server.ts\`, \`app/layout.tsx\`'s \`site_settings\` fetch, or \`.env.local.example\` unless the request is explicitly about one of them.
5. Every page that reads user data must keep its server-side \`supabase.auth.getUser()\` check and its \`redirect('/login')\`.
6. Database changes — only if the request truly cannot be done without one. Then add a NEW file \`supabase/migrations/<next-number>_short_name.sql\` (number = one past the highest existing migration), written to be safely re-runnable (\`create table if not exists\`, \`alter table ... add column if not exists\`). NEVER edit \`001_init.sql\`. NEVER write CREATE/ALTER/DROP that is schema-qualified with \`public.\` or \`auth.\`, and never a trigger on \`auth.users\` — this app shares a multi-tenant database. If a schema change adds something the Insights dashboard should count, \`create or replace view vw_metrics_daily\` in the same file to include it (columns day/metric_key/value; reuse the metric_key names this app already emits). Likewise keep \`vw_automation_due\` (trigger_type/ref_id/recipient_email/recipient_phone/context) current if the change affects a time-based automation.
7. If a referenced component/file does not exist yet and the request needs it, create it.
8. Payments: if the request involves charging customers, use the platform Checkout bridge — a SERVER-side POST to \`process.env.STRIPE_CHECKOUT_URL\` with header \`x-vw-checkout-secret: process.env.APP_CHECKOUT_SECRET\`, body \`{ mode: "payment"|"subscription", amount /* cents */, currency, interval?, productName, successUrl, cancelUrl, metadata }\`, then confirm with \`GET \${STRIPE_CHECKOUT_URL}?session_id=...\` before marking anything paid. Both env vars can be empty (owner hasn't connected Stripe) — degrade to a disabled "Payments aren't set up yet" state. Never call Stripe directly, never add a Stripe key.
9. If the request is unsafe, out of scope for this kind of app, or cannot be done without breaking the app, output NO file blocks and just: [CHANGELOG] Could not apply: <short reason>`;

export interface EditContext {
  appName: string;
  category: AppCategory;
}

export interface EditResult {
  /** Full merged file map, ready to serialize and deploy. */
  next: FileMap;
  /** Paths added or modified relative to the input. */
  changed: string[];
  /** Paths removed relative to the input. */
  removed: string[];
  /** One-line summary from the model. */
  changelog: string;
}

export class EditNoOpError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "EditNoOpError";
  }
}

const DELETE_LINE = /^\[DELETE:\s*([^\]\r\n]+)\]\s*$/gm;
const CHANGELOG_LINE = /\[CHANGELOG\]\s*(.+?)\s*$/m;

function buildUserPrompt(current: FileMap, requestText: string, ctx: EditContext): string {
  return [
    `APP: ${ctx.appName} (category: ${ctx.category})`,
    "",
    "CURRENT SOURCE:",
    "",
    serializeFileMap(current),
    "",
    "----",
    "",
    `CHANGE REQUEST: ${requestText.trim()}`,
  ].join("\n");
}

/**
 * Run one edit pass. Throws {@link EditNoOpError} when the model declined or
 * produced no file changes (the message carries the reason); throws on an
 * Anthropic API failure. On success the returned `next` is the complete map
 * to ship.
 */
export async function editApp(
  current: FileMap,
  requestText: string,
  ctx: EditContext,
): Promise<EditResult> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Stream: the SDK rejects a non-streaming request whose max_tokens
  // implies it could run past 10 minutes.
  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(current, requestText, ctx) }],
  });
  const message = await stream.finalMessage();

  await logAiUsage({
    source: "app_edit",
    model: MODEL,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const changelog = text.match(CHANGELOG_LINE)?.[1]?.trim() ?? "Applied the requested change.";

  const deletions: string[] = [];
  for (const m of text.matchAll(DELETE_LINE)) {
    deletions.push(m[1].trim().replace(/^\/+/, ""));
  }

  const patch = parseFileMap(text);
  const next = mergeFileMap(current, patch, { deletions });
  const { changed, removed } = diffFileMaps(current, next);

  if (changed.length === 0 && removed.length === 0) {
    throw new EditNoOpError(
      changelog.replace(/^Could not apply:\s*/i, "").trim() || "no changes were produced",
    );
  }

  return { next, changed, removed, changelog };
}
