// Phase 6a: given a freshly generated app and a list of concrete problems
// (from lib/apps/validateGenerated), ask Claude to emit just the corrected
// / missing files, merge them in, and re-check — up to a couple of rounds.
// Runs before the code is saved and deployed.

import Anthropic from "@anthropic-ai/sdk";
import { logAiUsage } from "@/lib/aiUsage";
import {
  mergeFileMap,
  parseFileMap,
  serializeFileMap,
  type FileMap,
} from "@/lib/apps/fileMap";
import { validateGenerated } from "@/lib/apps/validateGenerated";
import type { AppCategory } from "@/lib/database.types";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 32000;
const MAX_ROUNDS = 2;

const SYSTEM_PROMPT = `You are fixing specific, listed problems in a freshly generated Next.js 14 (App Router) + Supabase app BEFORE it is deployed. You get the full current source and a numbered list of problems.

OUTPUT FORMAT — output ONLY this:
- For every file you add or replace, its FULL new contents:
[FILENAME: path/to/file.tsx]
<entire file>
[/FILENAME]
- Nothing else. No prose, no explanation, no markdown fences, no preamble.

RULES
1. Fix every listed problem. Do not touch files that aren't part of a fix.
2. A file may legitimately contain "]" in its path (Next.js dynamic routes like app/x/[id]/page.tsx) — keep those.
3. Keep the existing stack and conventions. Use the primary / background Tailwind theme tokens, never a literal hex colour.
4. Migrations: never schema-qualify a CREATE/ALTER/DROP with public./auth./storage., never a trigger on auth.users. Keep the vw_metrics_daily and vw_automation_due views intact / add them if missing.
5. If a file was reported truncated, re-emit that whole file, complete and syntactically valid.`;

export interface RepairResult {
  map: FileMap;
  rounds: number;
  /** Problems still unresolved after the last round (empty = clean). */
  remaining: string[];
}

function buildUserPrompt(
  map: FileMap,
  problems: string[],
  ctx: { appName: string; category: AppCategory },
): string {
  return [
    `APP: ${ctx.appName} (category: ${ctx.category})`,
    "",
    "CURRENT SOURCE:",
    "",
    serializeFileMap(map),
    "",
    "----",
    "",
    "PROBLEMS TO FIX:",
    ...problems.map((p, i) => `${i + 1}. ${p}`),
  ].join("\n");
}

/**
 * @param initial       the parsed generation (may be missing truncated files)
 * @param initialProblems problems found against the *raw* output (carries
 *                        truncation, which a re-serialised map can't show)
 */
export async function repairGenerated(
  initial: FileMap,
  initialProblems: string[],
  ctx: { appName: string; category: AppCategory },
): Promise<RepairResult> {
  let map = initial;
  let problems = initialProblems;
  let rounds = 0;

  if (problems.length === 0) return { map, rounds, remaining: [] };

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  while (problems.length > 0 && rounds < MAX_ROUNDS) {
    rounds++;
    let text: string;
    let message: Anthropic.Message;
    try {
      // Must stream: the SDK rejects a non-streaming request whose
      // max_tokens implies it could run past 10 minutes.
      const stream = anthropic.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserPrompt(map, problems, ctx) }],
      });
      message = await stream.finalMessage();
      text = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
    } catch (err) {
      console.error("[repairGenerated] Anthropic call failed:", err);
      break;
    }

    await logAiUsage({
      source: "app_deploy_repair",
      model: MODEL,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    });
    const patch = parseFileMap(text);
    if (Object.keys(patch).length === 0) break; // nothing usable came back

    map = mergeFileMap(map, patch);
    // Subsequent rounds re-derive from the (now well-formed) serialised map.
    problems = validateGenerated(serializeFileMap(map), map, ctx.category);
  }

  return { map, rounds, remaining: problems };
}
