import Retell from "retell-sdk";
import type { LlmCreateParams } from "retell-sdk/resources/llm";
import { origin } from "@/lib/modules/bookingServer";
import { buildSystemPrompt } from "../prompt";
import { toolDefinitions } from "../tools";
import type { AgentSpec, VoiceProvider } from "./provider";

// Retell implementation of the voice provider. Each receptionist phone number
// gets one Retell LLM (the same prompt and tools as chat, in voice mode) and one
// agent. Per-call values — the current time and the minutes-cap note — come in
// as dynamic variables from the inbound webhook, so the stored prompt never
// goes stale. Server-only (RETELL_API_KEY).

export const VOICE_MODEL = "claude-4.5-haiku" as const;
const MAX_CALL_MS = 10 * 60_000; // hard per-call ceiling (cost guard)
const SILENCE_HANGUP_MS = 30_000;
const TRANSCRIPT_RETENTION_DAYS = 30; // Retell's own copy; ours lives in vw_receptionist_messages

function client(): Retell {
  return new Retell({ apiKey: process.env.RETELL_API_KEY! });
}

export function voiceUrls(base = origin()) {
  return {
    tools: `${base}/api/receptionist/voice/tools`,
    inbound: `${base}/api/receptionist/voice/inbound`,
    webhook: `${base}/api/receptionist/voice/webhook`,
  };
}

/** Opening line: AI disclosure + transcription notice, then the owner's greeting. */
export function beginMessage(spec: AgentSpec): string {
  return `Hi, you've reached ${spec.businessName}'s AI assistant. This call may be transcribed. ${spec.setup.greeting}`;
}

/** The Retell LLM config for a receptionist (exported for tests). */
export function llmParams(spec: AgentSpec, base = origin()): LlmCreateParams {
  const urls = voiceUrls(base);
  const prompt = buildSystemPrompt({
    businessName: spec.businessName,
    setup: spec.setup,
    channel: "voice",
    timeZone: spec.timeZone,
    services: spec.services,
    nowText: "{{now_text}}",
  });
  const tools: NonNullable<LlmCreateParams["general_tools"]> = toolDefinitions(spec.services.length > 0).map((t) => ({
    type: "custom" as const,
    name: t.name,
    description: t.description,
    url: urls.tools,
    parameters: t.input_schema as LlmCreateParams.CustomTool["parameters"],
    speak_during_execution: true,
    speak_after_execution: true,
    execution_message_description: "Say a short natural filler like \"One moment while I check that.\"",
    timeout_ms: 15_000,
    max_retry: 0, // tools save leads/bookings; never repeat them
  }));
  tools.push({ type: "end_call", name: "end_call", description: "Hang up politely once the caller is done or says goodbye." });
  if (spec.setup.transferPhone) {
    tools.push({
      type: "transfer_call",
      name: "transfer_to_owner",
      description: "Transfer to a person at the business when the caller asks for one or it's urgent. Take a message instead if the transfer fails.",
      transfer_destination: { type: "predefined", number: spec.setup.transferPhone },
      transfer_option: { type: "cold_transfer" },
    });
  }
  return {
    model: VOICE_MODEL,
    general_prompt: `${prompt}\n\n{{limit_note}}`,
    begin_message: beginMessage(spec),
    general_tools: tools,
    default_dynamic_variables: { now_text: "today", limit_note: "" },
  };
}

export function retellProvider(): VoiceProvider {
  return {
    async syncAgent(spec, agentId, opts) {
      const r = client();
      const params = llmParams(spec);
      if (agentId) {
        const agent = await r.agent.retrieve(agentId);
        const engine = agent.response_engine as { type: string; llm_id?: string };
        if (engine.type === "retell-llm" && engine.llm_id) {
          await r.llm.update(engine.llm_id, params);
          return agentId;
        }
      }
      if (opts?.updateOnly) throw new Error(`agent ${agentId ?? "(none)"} has no Retell LLM to update`);
      const llm = await r.llm.create(params);
      const agent = await r.agent
        .create({
        agent_name: `VW receptionist — ${spec.businessName}`.slice(0, 120),
        response_engine: { type: "retell-llm", llm_id: llm.llm_id },
        voice_id: process.env.RETELL_VOICE_ID || "retell-Cimo",
        language: "en-US",
        webhook_url: voiceUrls().webhook,
        webhook_events: ["call_ended", "call_analyzed"],
        max_call_duration_ms: MAX_CALL_MS,
        end_call_after_silence_ms: SILENCE_HANGUP_MS,
        data_storage_retention_days: TRANSCRIPT_RETENTION_DAYS,
        timezone: spec.timeZone,
        })
        .catch(async (err) => {
          await r.llm.delete(llm.llm_id).catch(() => {}); // don't leave an orphaned LLM behind
          throw err;
        });
      return agent.agent_id;
    },

    async buyNumber({ agentId, areaCode, nickname }) {
      const n = await client().phoneNumber.create({
        ...(areaCode ? { area_code: areaCode } : {}),
        country_code: "US",
        inbound_agents: [{ agent_id: agentId, weight: 1 }],
        inbound_webhook_url: voiceUrls().inbound,
        allowed_inbound_country_list: ["US", "CA"],
        nickname: nickname.slice(0, 60),
      });
      return n.phone_number;
    },

    async release({ phone, agentId }) {
      const r = client();
      const ignoreMissing = (err: unknown) => {
        if (!(err instanceof Retell.NotFoundError)) throw err;
      };
      if (phone) await r.phoneNumber.delete(phone).catch(ignoreMissing);
      if (agentId) {
        const agent = await r.agent.retrieve(agentId).catch((err) => (ignoreMissing(err), null));
        await r.agent.delete(agentId).catch(ignoreMissing);
        const engine = agent?.response_engine as { type: string; llm_id?: string } | undefined;
        if (engine?.type === "retell-llm" && engine.llm_id) await r.llm.delete(engine.llm_id).catch(ignoreMissing);
      }
    },

    async verify(rawBody, signature) {
      if (!signature || !process.env.RETELL_API_KEY) return false;
      try {
        return await Retell.verify(rawBody, process.env.RETELL_API_KEY, signature);
      } catch {
        return false;
      }
    },
  };
}
