import type { ReceptionistSetup } from "../config";
import type { BookingService } from "@/lib/modules/booking";

// What the receptionist needs from a voice platform. Retell implements it
// today (./retell.ts); keeping the rest of the code on this interface means a
// different provider (e.g. Vapi) can be swapped in without touching routes.

export interface AgentSpec {
  businessName: string;
  setup: ReceptionistSetup;
  timeZone: string;
  /** Bookable services when a live booking module is linked; empty = messages only. */
  services: BookingService[];
}

export interface VoiceProvider {
  /** Creates the agent, or updates it in place when `agentId` is given. Returns the agent id. */
  syncAgent(spec: AgentSpec, agentId?: string | null): Promise<string>;
  /** Buys a US number (optionally in an area code) wired to the agent. Returns E.164. */
  buyNumber(input: { agentId: string; areaCode: number | null; nickname: string }): Promise<string>;
  /** Releases a number and deletes its agent. Safe to call twice. */
  release(input: { phone: string; agentId: string | null }): Promise<void>;
  /** True if `signature` is the provider's signature of the exact raw body. */
  verify(rawBody: string, signature: string | null): Promise<boolean>;
}

export function voiceEnabled(): boolean {
  return process.env.RECEPTIONIST_VOICE_ENABLED === "true" && !!process.env.RETELL_API_KEY;
}
