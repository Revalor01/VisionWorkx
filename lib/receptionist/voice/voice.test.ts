import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/modules/supabase", () => ({ modulesServiceClient: vi.fn() }));
import { sign } from "retell-sdk";
import { parseBookingSetup } from "@/lib/modules/booking";
import { parseReceptionistSetup } from "../config";
import { beginMessage, llmParams, retellProvider, VOICE_MODEL } from "./retell";
import { callOutcome, callTranscript, type RetellCall } from "./calls";
import { capState } from "./server";
import type { AgentSpec } from "./provider";

const setup = parseReceptionistSetup({ about: "Family plumbing in Austin.", greeting: "How can I help?", transferPhone: "(512) 555-0123" });
const services = parseBookingSetup({ services: [{ id: "estimate", name: "Free estimate", durationMin: 30 }] }, "America/Chicago").services;
const spec: AgentSpec = { businessName: "Acme Plumbing", setup, timeZone: "America/Chicago", services };

describe("Retell agent config", () => {
  const p = llmParams(spec, "https://modules.test");

  it("opens with the AI disclosure and transcription notice", () => {
    expect(beginMessage(spec)).toBe("Hi, you've reached Acme Plumbing's AI assistant. This call may be transcribed. How can I help?");
    expect(p.begin_message).toBe(beginMessage(spec));
  });

  it("uses the voice prompt with per-call time and the minutes-cap slot", () => {
    expect(p.model).toBe(VOICE_MODEL);
    expect(p.general_prompt).toContain("You are on a phone call");
    expect(p.general_prompt).toContain("{{now_text}}");
    expect(p.general_prompt).toContain("{{limit_note}}");
    expect(p.default_dynamic_variables).toEqual({ now_text: "today", limit_note: "" });
  });

  it("points the same tools at our signed tools endpoint, never retried", () => {
    const custom = (p.general_tools ?? []).filter((t) => t.type === "custom") as { name: string; url: string; max_retry?: number }[];
    expect(custom.map((t) => t.name)).toEqual(["check_availability", "book_appointment", "take_message"]);
    for (const t of custom) {
      expect(t.url).toBe("https://modules.test/api/receptionist/voice/tools");
      expect(t.max_retry).toBe(0);
    }
  });

  it("adds hang-up, and transfer only when the owner gave a number", () => {
    const names = (p.general_tools ?? []).map((t) => t.name);
    expect(names).toContain("end_call");
    expect(names).toContain("transfer_to_owner");
    const transfer = (p.general_tools ?? []).find((t) => t.name === "transfer_to_owner") as { transfer_destination: { number: string } };
    expect(transfer.transfer_destination.number).toBe("+15125550123");
    const noTransfer = llmParams({ ...spec, setup: { ...setup, transferPhone: null }, services: [] }, "https://modules.test");
    expect((noTransfer.general_tools ?? []).map((t) => t.name)).toEqual(["take_message", "end_call"]);
  });
});

describe("Retell webhooks", () => {
  it("accepts only bodies signed with our API key", async () => {
    vi.stubEnv("RETELL_API_KEY", "key_test_123");
    const body = JSON.stringify({ event: "call_ended", call: { call_id: "c1" } });
    const good = await sign(body, "key_test_123");
    const bad = await sign(body, "someone_else");
    const p = retellProvider();
    expect(await p.verify(body, good)).toBe(true);
    expect(await p.verify(body, bad)).toBe(false);
    expect(await p.verify(body + " ", good)).toBe(false);
    expect(await p.verify(body, null)).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe("call payloads", () => {
  const call = (over: Partial<RetellCall> = {}): RetellCall => ({ call_id: "c1", to_number: "+15125550000", ...over });

  it("turns the transcript into conversation messages", () => {
    const t = callTranscript(call({ transcript_object: [{ role: "agent", content: "Hi!" }, { role: "user", content: " Need a plumber " }, { role: "transfer_target", content: "x" }, { role: "user", content: "" }] }));
    expect(t).toEqual([{ role: "assistant", content: "Hi!" }, { role: "visitor", content: "Need a plumber" }]);
  });

  it("works out what happened on the call", () => {
    const spoke = { transcript_object: [{ role: "user", content: "hello" }] };
    expect(callOutcome(call(spoke), "booked")).toBe("booked");
    expect(callOutcome(call({ ...spoke, disconnection_reason: "call_transfer" }), null)).toBe("transferred");
    expect(callOutcome(call(spoke), null)).toBe("answered");
    expect(callOutcome(call({ transcript_object: [{ role: "agent", content: "Hi!" }] }), null)).toBe("abandoned");
  });
});

describe("voice minutes cap", () => {
  it("answers normally under the plan, takes short messages at 100%, refuses past 120%", () => {
    expect(capState(99 * 60, 100)).toBe("ok");
    expect(capState(100 * 60, 100)).toBe("capped");
    expect(capState(119 * 60, 100)).toBe("capped");
    expect(capState(120 * 60, 100)).toBe("refuse");
    expect(capState(0, 0)).toBe("refuse");
  });
});
