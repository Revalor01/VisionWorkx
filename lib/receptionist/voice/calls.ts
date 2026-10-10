// Pure helpers for Retell call payloads (exported for tests; browser-safe).

/** The parts of Retell's call object the receptionist uses. */
export interface RetellCall {
  call_id: string;
  to_number: string;
  from_number?: string;
  duration_ms?: number;
  start_timestamp?: number;
  end_timestamp?: number;
  disconnection_reason?: string;
  call_cost?: { combined_cost?: number };
  transcript_object?: { role: string; content: string }[];
  call_analysis?: { call_summary?: string };
}

export type CallOutcome = "booked" | "message" | "transferred" | "answered" | "abandoned";

const MAX_MESSAGES = 200;

/** Transcript as conversation messages (agent -> assistant, caller -> visitor). */
export function callTranscript(call: RetellCall): { role: "visitor" | "assistant"; content: string }[] {
  return (call.transcript_object ?? [])
    .filter((u) => (u.role === "agent" || u.role === "user") && typeof u.content === "string" && u.content.trim())
    .slice(0, MAX_MESSAGES)
    .map((u) => ({ role: u.role === "user" ? ("visitor" as const) : ("assistant" as const), content: u.content.trim().slice(0, 4000) }));
}

/** What happened on the call; a booking/message recorded by a tool wins. */
export function callOutcome(call: RetellCall, fromTools: string | null): CallOutcome {
  if (fromTools === "booked" || fromTools === "message") return fromTools;
  if (call.disconnection_reason === "call_transfer" || call.disconnection_reason === "transfer_bridged") return "transferred";
  return callTranscript(call).some((m) => m.role === "visitor") ? "answered" : "abandoned";
}
