import Anthropic from "@anthropic-ai/sdk";
import { runTool, toolDefinitions, type ToolContext, type ToolDeps, type ToolResult } from "./tools";

// One receptionist turn: the visitor's message in, the assistant's reply out,
// running any tools the model calls along the way (at most MAX_TOOL_ROUNDS).
// Haiku 4.5, short capped replies, the business facts cached as the system
// prompt. The Claude call is injectable so the loop is testable.

export const RECEPTIONIST_MODEL = "claude-haiku-4-5";
export const MAX_REPLY_TOKENS = 400;
const MAX_TOOL_ROUNDS = 4;

export const FALLBACK_REPLY = "Sorry — I'm having trouble right now. Please contact the business directly, or try again in a moment.";

export type CreateMessage = (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;

export interface TurnInput {
  system: string;
  /** Prior turns, oldest first (plain text only; tool calls aren't kept between turns). */
  history: { role: "visitor" | "assistant"; content: string }[];
  message: string;
  canBook: boolean;
  ctx: ToolContext;
  deps: ToolDeps;
  create?: CreateMessage;
}

export interface TurnResult {
  reply: string;
  tokensIn: number;
  tokensOut: number;
  /** Tool calls that saved something (lead or booking). */
  saved: ToolResult[];
  failed: boolean;
}

function defaultCreate(): CreateMessage {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return (params) => client.messages.create(params);
}

export async function runTurn(input: TurnInput): Promise<TurnResult> {
  const create = input.create ?? defaultCreate();
  const messages: Anthropic.MessageParam[] = [
    ...input.history.map((m) => ({ role: m.role === "visitor" ? ("user" as const) : ("assistant" as const), content: m.content })),
    { role: "user", content: input.message },
  ];
  const tools = toolDefinitions(input.canBook);
  const saved: ToolResult[] = [];
  let tokensIn = 0;
  let tokensOut = 0;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    let res: Anthropic.Message;
    try {
      res = await create({
        model: RECEPTIONIST_MODEL,
        max_tokens: MAX_REPLY_TOKENS,
        system: [{ type: "text", text: input.system, cache_control: { type: "ephemeral" } }],
        tools,
        // Last round: no more tools, just answer.
        ...(round === MAX_TOOL_ROUNDS ? { tool_choice: { type: "none" as const } } : {}),
        messages,
      });
    } catch (err) {
      console.error("[receptionist/chat] Claude call failed:", err instanceof Anthropic.APIError ? err.status : err instanceof Error ? err.message : err);
      return { reply: FALLBACK_REPLY, tokensIn, tokensOut, saved, failed: true };
    }
    tokensIn += res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0);
    tokensOut += res.usage.output_tokens;

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();
    const calls = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

    if (res.stop_reason !== "tool_use" || calls.length === 0) {
      return { reply: text || FALLBACK_REPLY, tokensIn, tokensOut, saved, failed: !text };
    }

    messages.push({ role: "assistant", content: res.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of calls) {
      const r = await runTool(call.name, (call.input ?? {}) as Record<string, unknown>, input.ctx, input.deps).catch((err): ToolResult => {
        console.error("[receptionist/chat] tool failed:", call.name, err instanceof Error ? err.message : err);
        return { content: "That didn't work. Offer to take a message instead.", isError: true };
      });
      if (r.submissionId) saved.push(r);
      results.push({ type: "tool_result", tool_use_id: call.id, content: r.content, ...(r.isError ? { is_error: true } : {}) });
    }
    messages.push({ role: "user", content: results });
  }
  return { reply: FALLBACK_REPLY, tokensIn, tokensOut, saved, failed: true };
}
