import { after, NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { getModuleByPublicId } from "@/lib/modules/data";
import { modulesConfigured, modulesServiceClient } from "@/lib/modules/supabase";
import { corsHeaders, ipHash, json, originAllowed } from "@/lib/modules/http";
import { billingAllowsService, gateChat, limitsFor } from "@/lib/modules/plans";
import { sendUsageAlert } from "@/lib/modules/usage";
import { aiCostUsd, logAiUsage } from "@/lib/aiUsage";
import { isReceptionistModule } from "@/lib/receptionist/config";
import { RECEPTIONIST_MODEL, runTurn } from "@/lib/receptionist/chat";
import { addUsage, linkedBooking, realToolDeps, systemPromptFor, toolContext, usageThisMonth } from "@/lib/receptionist/server";

// Public: one chat turn with a workspace's AI receptionist. Same order as the
// submit route — cheap checks first, Claude last:
//   size -> JSON -> module -> origin -> honeypot -> rate limit -> conversation/plan gate -> turn.
// A conversation is identified by its id plus a random token only the
// visitor's browser holds (we store its sha256), so nobody can read or
// continue someone else's chat.

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_BYTES = 8 * 1024;
const MAX_MESSAGE = 1000;
const MAX_MESSAGES = 40; // 20 visitor turns per conversation
const HISTORY = 20;
const UUID_RE = /^[0-9a-f-]{36}$/;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function OPTIONS(req: NextRequest, props: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await props.params;
  if (!modulesConfigured()) return new NextResponse(null, { status: 204 });
  const mod = await getModuleByPublicId(moduleId);
  return new NextResponse(null, { status: 204, headers: corsHeaders(req, mod?.domains ?? []) });
}

export async function POST(req: NextRequest, props: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await props.params;
  if (!modulesConfigured()) return NextResponse.json({ error: "Not available." }, { status: 503 });

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) return NextResponse.json({ error: "Too large." }, { status: 413 });
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return NextResponse.json({ error: "Too large." }, { status: 413 });

  let body: { conversationId?: unknown; token?: unknown; message?: unknown; source_url?: unknown; vw_hp?: unknown };
  try {
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const mod = await getModuleByPublicId(moduleId);
  if (!mod || !isReceptionistModule(mod.type) || !mod.receptionist || mod.status !== "live" || !billingAllowsService(mod.billingStatus)) {
    return NextResponse.json({ error: "This chat isn't available." }, { status: 404 });
  }
  const domains = mod.domains;
  if (!originAllowed(req, domains)) return json(req, domains, { error: "This chat can't be used from this website." }, 403);

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return json(req, domains, { error: "Type a message first." }, 400);
  if (message.length > MAX_MESSAGE) return json(req, domains, { error: `Keep messages under ${MAX_MESSAGE} characters.` }, 400);

  // Honeypot filled: answer politely, spend nothing.
  if (typeof body.vw_hp === "string" && body.vw_hp !== "") {
    return json(req, domains, { reply: mod.receptionist.greeting });
  }

  const db = modulesServiceClient();
  const ip = ipHash(req);
  const [perIp, perModule] = await Promise.all([
    db.rpc("vw_rate_check", { p_key: `rcp:${mod.publicId}:${ip}`, max_hits: 30, window_seconds: 600 }),
    db.rpc("vw_rate_check", { p_key: `rcp:${mod.publicId}`, max_hits: 600, window_seconds: 3600 }),
  ]);
  if (perIp.data === false || perModule.data === false) {
    return json(req, domains, { error: "You're sending messages too quickly — please wait a few minutes." }, 429, { "Retry-After": "600" });
  }

  const alertWs = { id: mod.workspaceId, name: mod.workspaceName, slug: mod.workspaceSlug, plan: mod.plan, notification_email: mod.notificationEmail };
  const sourceUrl = typeof body.source_url === "string" && /^https?:\/\//.test(body.source_url) ? body.source_url.slice(0, 500) : null;

  // Continue an existing conversation (id + token), or start a new one (counts toward the plan).
  let conv: { id: string; submission_id: string | null; message_count: number; tokens_in: number; tokens_out: number; cost_usd: number };
  let newToken: string | null = null;
  const convId = typeof body.conversationId === "string" && UUID_RE.test(body.conversationId) ? body.conversationId : null;
  const token = typeof body.token === "string" && body.token.length === 64 ? body.token : null;
  if (convId && token) {
    const { data } = await db
      .from("vw_receptionist_conversations")
      .select("id, visitor_hash, submission_id, message_count, tokens_in, tokens_out, cost_usd")
      .eq("id", convId)
      .eq("module_id", mod.id)
      .eq("channel", "chat")
      .maybeSingle();
    if (!data || !data.visitor_hash || !sameHash(data.visitor_hash, sha256(token))) {
      return json(req, domains, { error: "This chat has expired — refresh the page to start a new one.", code: "expired" }, 404);
    }
    conv = { ...data, cost_usd: Number(data.cost_usd) };
    if (conv.message_count >= MAX_MESSAGES) {
      return json(req, domains, {
        conversationId: conv.id,
        reply: `We've covered a lot! To keep going, please leave your details and ${mod.receptionist.followUp.charAt(0).toLowerCase()}${mod.receptionist.followUp.slice(1)}`,
        limit: true,
      });
    }
  } else {
    const usage = await usageThisMonth(mod.workspaceId);
    const gate = gateChat(usage.chats, limitsFor(mod.plan).chatsPerMonth);
    if (!gate.allow) {
      after(() => sendUsageAlert(alertWs, "chats_150"));
      return json(req, domains, { error: "Chat is unavailable right now. Please contact the business directly.", code: "paused" }, 503);
    }
    newToken = randomBytes(32).toString("hex");
    const { data, error } = await db
      .from("vw_receptionist_conversations")
      .insert({ workspace_id: mod.workspaceId, module_id: mod.id, channel: "chat", visitor_hash: sha256(newToken) })
      .select("id")
      .single();
    if (error || !data) {
      console.error("[receptionist/chat] conversation insert failed:", error?.code);
      return json(req, domains, { error: "Something went wrong — please try again." }, 500);
    }
    conv = { id: data.id, submission_id: null, message_count: 0, tokens_in: 0, tokens_out: 0, cost_usd: 0 };
    await addUsage(mod.workspaceId, 1, 0);
    if (gate.alert) after(() => sendUsageAlert(alertWs, gate.alert!));
  }

  const { data: past } = await db
    .from("vw_receptionist_messages")
    .select("role, content")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: false })
    .limit(HISTORY);
  const history = ((past ?? []) as { role: "visitor" | "assistant"; content: string }[]).reverse();

  const booking = await linkedBooking(mod);
  let system = systemPromptFor(mod, booking, "chat", mod.timeZone);
  if (conv.submission_id) system += "\n\nNote: this customer's details or booking were already saved earlier in this conversation. Don't save them again unless they ask for something new.";

  const turn = await runTurn({
    system,
    history,
    message,
    canBook: !!booking,
    ctx: toolContext(mod, booking, "chat", sourceUrl),
    deps: realToolDeps(mod.workspaceName),
  });

  const cost = aiCostUsd(RECEPTIONIST_MODEL, turn.tokensIn, turn.tokensOut) ?? 0;
  const submissionId = turn.saved[turn.saved.length - 1]?.submissionId ?? conv.submission_id;
  const now = new Date().toISOString();
  const [ins] = await Promise.all([
    db.from("vw_receptionist_messages").insert([
      { conversation_id: conv.id, workspace_id: mod.workspaceId, role: "visitor", content: message },
      { conversation_id: conv.id, workspace_id: mod.workspaceId, role: "assistant", content: turn.reply.slice(0, 4000) },
    ]),
    db
      .from("vw_receptionist_conversations")
      .update({
        message_count: conv.message_count + 2,
        tokens_in: conv.tokens_in + turn.tokensIn,
        tokens_out: conv.tokens_out + turn.tokensOut,
        cost_usd: Number((conv.cost_usd + cost).toFixed(4)),
        submission_id: submissionId,
        last_at: now,
      })
      .eq("id", conv.id),
  ]);
  if (ins.error) console.error("[receptionist/chat] message insert failed:", ins.error.code);
  if (turn.tokensIn + turn.tokensOut > 0) {
    await logAiUsage({ source: "receptionist_chat", model: RECEPTIONIST_MODEL, inputTokens: turn.tokensIn, outputTokens: turn.tokensOut });
  }

  return json(req, domains, {
    conversationId: conv.id,
    ...(newToken ? { token: newToken } : {}),
    reply: turn.reply,
    saved: turn.saved.length > 0,
  });
}
