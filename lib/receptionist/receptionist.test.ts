import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/modules/supabase", () => ({ modulesServiceClient: vi.fn() }));
import type Anthropic from "@anthropic-ai/sdk";
import { gateChat, PLAN_LIMITS, voiceAlert, voiceAllowed } from "@/lib/modules/plans";
import { buildStoredConfig } from "@/lib/modules/moduleConfig";
import { parseBookingSetup } from "@/lib/modules/booking";
import { parseReceptionistConfig, parseReceptionistSetup, RECEPTIONIST_FIELDS, toE164 } from "./config";
import { buildSystemPrompt } from "./prompt";
import { runTool, toolDefinitions, type ToolContext, type ToolDeps } from "./tools";
import { FALLBACK_REPLY, runTurn, type CreateMessage } from "./chat";
import { configFromReceptionistDraft } from "./draft";
import { embedSnippet } from "@/lib/modules/install";

const ABOUT = "Family-run plumbing company serving Austin, Round Rock and Cedar Park.";

describe("receptionist config", () => {
  it("fills safe defaults and drops junk", () => {
    const s = parseReceptionistSetup({ tone: "shouty", faq: [{ q: "Q?", a: "" }, { q: "Open Sunday?", a: "No." }, "x"], bookingModuleId: "nope" });
    expect(s.tone).toBe("friendly");
    expect(s.faq).toEqual([{ q: "Open Sunday?", a: "No." }]);
    expect(s.bookingModuleId).toBeNull();
    expect(s.greeting).toBeTruthy();
    expect(s.followUp).toBeTruthy();
  });

  it("always stores the fixed lead fields and no payment, whatever is sent", () => {
    const c = parseReceptionistConfig({ fields: [{ id: "ssn", label: "SSN", type: "text" }], payment: { enabled: true, amountCents: 5000 } });
    expect(c.fields).toEqual(RECEPTIONIST_FIELDS);
    expect(c.payment).toBeNull();
  });

  it("normalises US phone numbers for transfers", () => {
    expect(toE164("(512) 555-0123")).toBe("+15125550123");
    expect(toE164("+1 512 555 0123")).toBe("+15125550123");
    expect(toE164("123")).toBeNull();
    expect(toE164("+44 20 7946 0958")).toBeNull();
  });

  it("is a creatable module type that needs a description of the business", () => {
    expect(buildStoredConfig("receptionist", {})).toEqual({ error: expect.stringContaining("what your business does") });
    const ok = buildStoredConfig("receptionist", { receptionist: { about: ABOUT } });
    expect("config" in ok && ok.config.receptionist?.about).toBe(ABOUT);
  });

  it("turns a draft into a sanitised config", () => {
    const c = configFromReceptionistDraft({
      title: "Questions?", intro: "Ask us", greeting: "Hi!", about: ABOUT, services: "Drain cleaning $129", hours: "Mon-Fri 7-6",
      location: "Austin", faq: [{ q: "Licensed?", a: "Yes." }], follow_up: "We'll call you back.", tone: "casual",
    });
    expect(c.receptionist).toMatchObject({ about: ABOUT, tone: "casual", followUp: "We'll call you back.", faq: [{ q: "Licensed?", a: "Yes." }] });
  });

  it("gives the receptionist a floating-chat snippet", () => {
    expect(embedSnippet("m_aaaaaaaaaaaaaaaaaa", "https://x.test", "receptionist")).toContain('data-widget="chat"');
    expect(embedSnippet("m_aaaaaaaaaaaaaaaaaa", "https://x.test", "booking")).not.toContain("data-widget");
  });
});

describe("receptionist plan limits", () => {
  it("includes chats and voice minutes on every plan", () => {
    expect(PLAN_LIMITS.starter).toMatchObject({ chatsPerMonth: 300, voiceMinutesPerMonth: 100 });
    expect(PLAN_LIMITS.growth).toMatchObject({ chatsPerMonth: 1500, voiceMinutesPerMonth: 300 });
    expect(PLAN_LIMITS.pro).toMatchObject({ chatsPerMonth: 5000, voiceMinutesPerMonth: 1000 });
  });
  it("chat is a soft limit: warns at 80/100%, pauses at 150%", () => {
    expect(gateChat(239, 300)).toEqual({ allow: true, alert: "chats_80" });
    expect(gateChat(299, 300)).toEqual({ allow: true, alert: "chats_100" });
    expect(gateChat(449, 300).allow).toBe(true);
    expect(gateChat(450, 300)).toEqual({ allow: false, alert: "chats_150" });
  });
  it("voice is a hard cap", () => {
    expect(voiceAllowed(100 * 60 - 1, 100)).toBe(true);
    expect(voiceAllowed(100 * 60, 100)).toBe(false);
    expect(voiceAllowed(0, 0)).toBe(false);
    expect(voiceAlert(4700, 4900, 100)).toBe("voice_80");
    expect(voiceAlert(5900, 6100, 100)).toBe("voice_100");
    expect(voiceAlert(100, 200, 100)).toBeNull();
  });
});

describe("system prompt", () => {
  const setup = parseReceptionistSetup({ about: ABOUT, services: "Drain cleaning $129", followUp: "We'll call within a day." });
  it("answers only from the facts and discloses it's an AI", () => {
    const p = buildSystemPrompt({ businessName: "Acme Plumbing", setup, channel: "chat", timeZone: "America/Chicago", services: [], nowText: "Saturday" });
    expect(p).toContain("Answer ONLY from the business facts");
    expect(p).toContain("you are an AI assistant");
    expect(p).toContain("Drain cleaning $129");
    expect(p).toContain("can't book appointments");
    expect(p).toContain("We'll call within a day.");
  });
  it("speaks briefly on the phone and lists bookable services", () => {
    const booking = parseBookingSetup({ services: [{ id: "estimate", name: "Free estimate", durationMin: 30 }] }, "America/Chicago");
    const p = buildSystemPrompt({ businessName: "Acme", setup, channel: "voice", timeZone: "America/Chicago", services: booking.services, nowText: "Saturday" });
    expect(p).toContain("phone call");
    expect(p).toContain('id "estimate"');
    expect(toolDefinitions(true).map((t) => t.name)).toEqual(["check_availability", "book_appointment", "take_message"]);
    expect(toolDefinitions(false).map((t) => t.name)).toEqual(["take_message"]);
  });
});

// ── tools ────────────────────────────────────────────────────────────────────

const NOW = new Date("2026-10-12T14:00:00Z"); // Monday 9:00 Chicago
const setup = parseBookingSetup(
  {
    services: [{ id: "estimate", name: "Free estimate", durationMin: 60, bufferMin: 0 }],
    weekly: [[], [{ start: "09:00", end: "17:00" }], [{ start: "09:00", end: "17:00" }], [], [], [], []],
    minNoticeHours: 2,
    maxDaysAhead: 30,
    slotStepMin: 60,
  },
  "America/Chicago",
);

function ctx(withBooking = true): ToolContext {
  return {
    channel: "chat",
    workspaceId: "ws1",
    plan: "starter",
    workspaceName: "Acme",
    sourceUrl: null,
    receptionist: { id: "rec1", publicId: "m_rec", name: "Receptionist" },
    booking: withBooking ? { id: "bk1", publicId: "m_bk", name: "Booking", setup } : null,
    callerPhone: null,
  };
}

function deps(over: Partial<ToolDeps> = {}) {
  const leads: unknown[] = [];
  const claimed = new Set<string>();
  const d: ToolDeps = {
    now: () => NOW,
    // Mirrors the DB-enforced cap: one booking and one message per conversation.
    claimSave: async (kind) => {
      if (claimed.has(kind)) return false;
      claimed.add(kind);
      return true;
    },
    busyRanges: async () => [],
    reserveSlot: async () => ({ ok: true, bookingId: "b1", token: "tok" }),
    createLead: async (input) => {
      leads.push(input);
      return { ok: true, submissionId: `sub${leads.length}` };
    },
    afterBooking: vi.fn(async () => {}),
    manageUrl: (t) => `https://x.test/b/${t}`,
    cancelReservation: vi.fn(async () => {}),
    ...over,
  };
  return { d, leads };
}

describe("receptionist tools", () => {
  it("take_message needs an email or phone, then saves a lead on the receptionist module", async () => {
    const { d, leads } = deps();
    const bad = await runTool("take_message", { name: "Pat", message: "Leaky tap" }, ctx(), d);
    expect(bad.isError).toBe(true);
    expect(leads).toHaveLength(0);

    const ok = await runTool("take_message", { name: "Pat", phone: "512-555-0123", message: "Leaky tap" }, ctx(), d);
    expect(ok).toMatchObject({ outcome: "message", submissionId: "sub1" });
    expect(leads[0]).toMatchObject({ moduleId: "rec1", moduleType: "receptionist", values: { name: "Pat", phone: "512-555-0123", message: "Leaky tap" } });
  });

  it("rejects a bad email with the forms' own rules", async () => {
    const { d } = deps();
    const r = await runTool("take_message", { name: "Pat", email: "not-an-email", message: "Hi" }, ctx(), d);
    expect(r.isError).toBe(true);
  });

  it("uses caller ID on phone calls when no number is given", async () => {
    const { d, leads } = deps();
    await runTool("take_message", { name: "Pat", message: "Call me" }, { ...ctx(), channel: "voice", callerPhone: "+15125550123" }, d);
    expect(leads[0]).toMatchObject({ values: { phone: "+15125550123", channel: "Phone call (AI receptionist)" } });
  });

  it("lists real open times from the booking setup", async () => {
    const { d } = deps();
    const r = await runTool("check_availability", { service_id: "estimate" }, ctx(), d);
    expect(r.content).toContain("Open times for Free estimate");
    expect(r.content).toContain("2026-10-12T16:00:00.000Z"); // 11:00 Chicago (9:00 + 2h notice)
  });

  it("books through the booking module and saves the booking as its submission", async () => {
    const { d, leads } = deps();
    const r = await runTool("book_appointment", { service_id: "estimate", start: "2026-10-12T16:00:00.000Z", name: "Pat", email: "pat@example.com" }, ctx(), d);
    expect(r).toMatchObject({ outcome: "booked", submissionId: "sub1" });
    expect(leads[0]).toMatchObject({ moduleId: "bk1", moduleType: "booking", values: { name: "Pat", email: "pat@example.com", bk_manage: "https://x.test/b/tok" } });
    expect(d.afterBooking).toHaveBeenCalledOnce();
  });

  it("releases the slot when the booking can't be saved", async () => {
    const { d } = deps({ createLead: async () => ({ ok: false }) });
    const r = await runTool("book_appointment", { service_id: "estimate", start: "2026-10-12T16:00:00.000Z", name: "Pat", phone: "5125550123" }, ctx(), d);
    expect(r.isError).toBe(true);
    expect(d.cancelReservation).toHaveBeenCalledWith("b1");
  });

  it("saves at most one message and one booking per conversation, however the model is steered", async () => {
    const { d, leads } = deps();
    const a = await runTool("take_message", { name: "Pat", phone: "5125550123", message: "One" }, ctx(), d);
    const b = await runTool("take_message", { name: "Eve", email: "victim@example.com", message: "Two" }, ctx(), d);
    expect(a.outcome).toBe("message");
    expect(b.isError).toBe(true);
    const c = await runTool("book_appointment", { service_id: "estimate", start: "2026-10-12T16:00:00.000Z", name: "Pat", phone: "5125550123" }, ctx(), d);
    const e = await runTool("book_appointment", { service_id: "estimate", start: "2026-10-12T17:00:00.000Z", name: "Eve", email: "victim@example.com" }, ctx(), d);
    expect(c.outcome).toBe("booked");
    expect(e.isError).toBe(true);
    expect(leads).toHaveLength(2);
  });

  it("passes the plan through so leads respect the submissions limit", async () => {
    const { d } = deps({ createLead: async () => ({ ok: false, reason: "limit" }) });
    const r = await runTool("take_message", { name: "Pat", phone: "5125550123", message: "Hi" }, ctx(), d);
    expect(r).toMatchObject({ isError: true, content: expect.stringContaining("contact the business directly") });
  });

  it("refuses booking tools when no booking module is linked", async () => {
    const { d } = deps();
    const r = await runTool("check_availability", { service_id: "estimate" }, ctx(false), d);
    expect(r.isError).toBe(true);
  });
});

// ── chat loop ────────────────────────────────────────────────────────────────

function msg(content: Anthropic.ContentBlock[], stop: Anthropic.Message["stop_reason"]): Anthropic.Message {
  return {
    id: "m", type: "message", role: "assistant", model: "claude-haiku-4-5", content, stop_reason: stop, stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  } as unknown as Anthropic.Message;
}

describe("runTurn", () => {
  it("runs a tool call, then returns the model's reply", async () => {
    const { d, leads } = deps();
    const create = vi.fn<CreateMessage>()
      .mockResolvedValueOnce(msg([{ type: "tool_use", id: "t1", name: "take_message", input: { name: "Pat", email: "pat@example.com", message: "Quote" } } as Anthropic.ToolUseBlock], "tool_use"))
      .mockResolvedValueOnce(msg([{ type: "text", text: "Got it — we'll be in touch.", citations: null } as Anthropic.TextBlock], "end_turn"));
    const r = await runTurn({ system: "s", history: [], message: "I need a quote", canBook: false, ctx: ctx(false), deps: d, create });
    expect(r.reply).toBe("Got it — we'll be in touch.");
    expect(r.saved).toHaveLength(1);
    expect(leads).toHaveLength(1);
    expect(r.tokensIn).toBe(200);
    // The tool result went back to the model.
    const second = create.mock.calls[1][0];
    expect(JSON.stringify(second.messages)).toContain("Message saved");
  });

  it("falls back politely when Claude fails", async () => {
    const { d } = deps();
    const create = vi.fn<CreateMessage>().mockRejectedValue(new Error("down"));
    const r = await runTurn({ system: "s", history: [], message: "hi", canBook: false, ctx: ctx(false), deps: d, create });
    expect(r).toMatchObject({ reply: FALLBACK_REPLY, failed: true });
  });
});
