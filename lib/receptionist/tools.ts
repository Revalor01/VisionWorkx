import type Anthropic from "@anthropic-ai/sdk";
import {
  bookingFieldDefs,
  bookingValues,
  formatWhen,
  generateSlots,
  localDate,
  whenText,
  type BookingService,
  type BookingSetup,
  type Busy,
} from "@/lib/modules/booking";
import { validateSubmission } from "@/lib/modules/config";
import type { BookResult } from "@/lib/modules/bookingServer";
import { RECEPTIONIST_FIELDS, parseReceptionistConfig } from "./config";
import type { Channel } from "./prompt";
import type { LeadInput } from "./lead";

// The receptionist's tools: check open times, book (through the linked booking
// module's real slot logic — the database still rejects double-booking), and
// take a message. Each one ends in an ordinary submission, so the owner gets
// the usual alert email and it shows on their board. Shared by chat and voice;
// side effects are injected so the logic is testable without a database.

export const TOOL_NAMES = ["check_availability", "book_appointment", "take_message"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SLOTS = 8;

export interface ToolContext {
  channel: Channel;
  workspaceId: string;
  workspaceName: string;
  sourceUrl: string | null;
  receptionist: { id: string; publicId: string; name: string };
  /** The linked booking module when it's live in the same workspace; null = no booking. */
  booking: { id: string; publicId: string; name: string; setup: BookingSetup } | null;
  /** Caller ID on phone calls (pre-fills the lead's phone when they don't give one). */
  callerPhone: string | null;
}

export interface ToolDeps {
  now: () => Date;
  busyRanges: (workspaceId: string, from: Date, to: Date) => Promise<Busy[]>;
  reserveSlot: (input: { workspaceId: string; moduleId: string; setup: BookingSetup; service: BookingService; start: Date; customerTz: string | null }) => Promise<BookResult>;
  createLead: (input: LeadInput) => Promise<{ ok: true; submissionId: string } | { ok: false }>;
  afterBooking: (input: { bookingId: string; submissionId: string; token: string; start: Date; service: BookingService; setup: BookingSetup; values: Record<string, string> }) => Promise<void>;
  manageUrl: (token: string) => string;
  cancelReservation: (bookingId: string) => Promise<void>;
}

/** What one tool call did; `content` goes back to the model. */
export interface ToolResult {
  content: string;
  isError?: boolean;
  submissionId?: string;
  outcome?: "booked" | "message";
}

/** Tool definitions for the Claude API (booking tools only when booking is available). */
export function toolDefinitions(canBook: boolean): Anthropic.Tool[] {
  const contact = {
    name: { type: "string", description: "The customer's name." },
    email: { type: "string", description: "Their email, if they gave one." },
    phone: { type: "string", description: "Their phone number, if they gave one." },
  };
  const take: Anthropic.Tool = {
    name: "take_message",
    description: "Save a message for the business team. Call once you have the customer's name, an email or phone number, and what they need.",
    input_schema: {
      type: "object",
      properties: { ...contact, message: { type: "string", description: "What they need, in one or two sentences, written for the business owner." } },
      required: ["name", "message"],
    },
  };
  if (!canBook) return [take];
  return [
    {
      name: "check_availability",
      description: "List open appointment start times for one service, starting from a date (defaults to today).",
      input_schema: {
        type: "object",
        properties: {
          service_id: { type: "string", description: "One of the bookable service ids." },
          date: { type: "string", description: "First day to look at, YYYY-MM-DD in the business's time zone." },
        },
        required: ["service_id"],
      },
    },
    {
      name: "book_appointment",
      description: "Book a time the customer chose from check_availability. Needs their name and an email or phone number.",
      input_schema: {
        type: "object",
        properties: {
          service_id: { type: "string" },
          start: { type: "string", description: "The exact start value returned by check_availability (ISO 8601)." },
          ...contact,
          notes: { type: "string", description: "Anything the business should know, optional." },
        },
        required: ["service_id", "start", "name"],
      },
    },
    take,
  ];
}

function s(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** Validates contact details with the same rules as the forms; needs an email or a phone. */
function contactValues(input: Record<string, unknown>, ctx: ToolContext, message: string): { ok: true; values: Record<string, string> } | { ok: false; error: string } {
  const raw = {
    name: s(input.name, 120),
    email: s(input.email, 254),
    phone: s(input.phone, 40) || (ctx.channel === "voice" ? ctx.callerPhone ?? "" : ""),
    message,
    channel: ctx.channel === "voice" ? "Phone call (AI receptionist)" : "Website chat (AI receptionist)",
  };
  const form = parseReceptionistConfig({});
  const r = validateSubmission({ ...form, fields: RECEPTIONIST_FIELDS }, raw);
  if (!r.ok) return { ok: false, error: Object.values(r.errors).join(" ") };
  const values = r.values as Record<string, string>;
  if (!values.email && !values.phone) return { ok: false, error: "Ask for an email address or phone number first." };
  return { ok: true, values };
}

export async function runTool(name: string, input: Record<string, unknown>, ctx: ToolContext, deps: ToolDeps): Promise<ToolResult> {
  if (name === "take_message") {
    const message = s(input.message, 4000);
    const contact = contactValues(input, ctx, message);
    if (!contact.ok) return { content: contact.error, isError: true };
    const lead = await deps.createLead({
      workspaceId: ctx.workspaceId,
      workspaceName: ctx.workspaceName,
      moduleId: ctx.receptionist.id,
      modulePublicId: ctx.receptionist.publicId,
      moduleType: "receptionist",
      moduleName: ctx.receptionist.name,
      values: contact.values,
      fields: RECEPTIONIST_FIELDS.map((f) => ({ id: f.id, label: f.label, type: f.type })),
      sourceUrl: ctx.sourceUrl,
    });
    if (!lead.ok) return { content: "Saving the message failed. Apologise and ask them to contact the business directly.", isError: true };
    return { content: "Message saved. The team has been notified.", submissionId: lead.submissionId, outcome: "message" };
  }

  if (!ctx.booking) return { content: "Booking isn't available. Offer to take a message instead.", isError: true };
  const setup = ctx.booking.setup;
  const service = setup.services.find((x) => x.id === s(input.service_id, 40));
  if (!service) return { content: `Unknown service. Use one of: ${setup.services.map((x) => x.id).join(", ")}.`, isError: true };
  const now = deps.now();

  if (name === "check_availability") {
    const date = s(input.date, 10);
    const from = DATE_RE.test(date) && date >= localDate(now, setup.timeZone) ? date : localDate(now, setup.timeZone);
    const [y, m, d] = from.split("-").map(Number);
    const days = 7;
    const busy = await deps.busyRanges(ctx.workspaceId, new Date(Date.UTC(y, m - 1, d) - 86400e3), new Date(Date.UTC(y, m - 1, d + days) + 86400e3));
    const slots = generateSlots(setup, service, from, days, busy, now).slice(0, MAX_SLOTS);
    if (slots.length === 0) return { content: `No open times for ${service.name} in the 7 days from ${from}. Offer a later date or to take a message.` };
    return {
      content: `Open times for ${service.name} (${setup.timeZone}):\n${slots.map((t) => `- ${formatWhen(t, setup.timeZone, false)} → start: ${t.toISOString()}`).join("\n")}`,
    };
  }

  if (name === "book_appointment") {
    const start = new Date(s(input.start, 40));
    if (Number.isNaN(start.getTime())) return { content: "Use an exact start value from check_availability.", isError: true };
    const notes = s(input.notes, 1000);
    const contact = contactValues(input, ctx, notes ? `Booked ${service.name}. Notes: ${notes}` : `Booked ${service.name}.`);
    if (!contact.ok) return { content: contact.error, isError: true };

    const r = await deps.reserveSlot({ workspaceId: ctx.workspaceId, moduleId: ctx.booking.id, setup, service, start, customerTz: null });
    if (!r.ok) {
      return {
        content: r.reason === "error" ? "Booking failed. Offer to take a message instead." : "That time is no longer available. Check availability again and offer other times.",
        isError: true,
      };
    }
    const values = {
      ...bookingValues({ whenText: whenText(start, setup, null), service, manageUrl: deps.manageUrl(r.token), locationNote: setup.locationNote }),
      ...contact.values,
    };
    const lead = await deps.createLead({
      workspaceId: ctx.workspaceId,
      workspaceName: ctx.workspaceName,
      moduleId: ctx.booking.id,
      modulePublicId: ctx.booking.publicId,
      moduleType: "booking",
      moduleName: ctx.booking.name,
      values,
      fields: [...bookingFieldDefs().map((f) => ({ ...f, type: "text" })), ...RECEPTIONIST_FIELDS.map((f) => ({ id: f.id, label: f.label, type: f.type }))],
      sourceUrl: ctx.sourceUrl,
    });
    if (!lead.ok) {
      await deps.cancelReservation(r.bookingId); // don't leave a slot held for a booking that didn't save
      return { content: "Booking failed. Offer to take a message instead.", isError: true };
    }
    await deps.afterBooking({ bookingId: r.bookingId, submissionId: lead.submissionId, token: r.token, start, service, setup, values });
    return {
      content: `Booked ${service.name} for ${formatWhen(start, setup.timeZone)}.${contact.values.email ? " A confirmation email is on its way." : ""}`,
      submissionId: lead.submissionId,
      outcome: "booked",
    };
  }

  return { content: `Unknown tool ${name}.`, isError: true };
}
