import { createHash, randomBytes } from "crypto";
import { modulesServiceClient } from "./supabase";
import { EMBED_ORIGIN } from "./constants";
import { submissionEmail } from "./submissionEmail";
import {
  canChange,
  formatWhen,
  isBookingModule,
  isSlotAvailable,
  parseBookingSetup,
  whenText,
  type BookingService,
  type BookingSetup,
  type Busy,
} from "./booking";

// Server-only booking operations. Availability is re-checked here, and the
// database's exclusion constraint (vw_bookings_no_overlap) is the final word:
// a racing second booking for the same time fails with SQLSTATE 23P01.

export const REMINDER_HOURS = 24;

export function origin(): string {
  return process.env.NEXT_PUBLIC_MODULES_EMBED_ORIGIN ?? EMBED_ORIGIN;
}

export function newManageToken(): { token: string; hash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(`vw-booking:${token}`).digest("hex");
}

/** Confirmed bookings (with buffers) overlapping [from, to) for a workspace. */
export async function busyRanges(workspaceId: string, from: Date, to: Date, excludeBookingId?: string): Promise<Busy[]> {
  let q = modulesServiceClient()
    .from("vw_bookings")
    .select("id, starts_at, block_ends_at")
    .eq("workspace_id", workspaceId)
    .eq("status", "confirmed")
    .lt("starts_at", to.toISOString())
    .gt("block_ends_at", from.toISOString())
    .limit(2000);
  if (excludeBookingId) q = q.neq("id", excludeBookingId);
  const { data } = await q;
  return (data ?? []).map((b) => ({ start: new Date(b.starts_at), end: new Date(b.block_ends_at) }));
}

export type BookResult = { ok: true; bookingId: string; token: string } | { ok: false; reason: "unavailable" | "taken" | "error" };

/** Re-checks availability, then inserts the booking (DB rejects overlaps). */
export async function reserveSlot(input: {
  workspaceId: string;
  moduleId: string;
  setup: BookingSetup;
  service: BookingService;
  start: Date;
  customerTz: string | null;
}): Promise<BookResult> {
  const { setup, service, start } = input;
  const dayMs = 86400e3;
  const busy = await busyRanges(input.workspaceId, new Date(start.getTime() - dayMs), new Date(start.getTime() + dayMs));
  if (!isSlotAvailable(setup, service, start, busy, new Date())) return { ok: false, reason: "unavailable" };
  const { token, hash } = newManageToken();
  const end = new Date(start.getTime() + service.durationMin * 60000);
  const { data, error } = await modulesServiceClient()
    .from("vw_bookings")
    .insert({
      workspace_id: input.workspaceId,
      module_id: input.moduleId,
      service_id: service.id,
      service_name: service.name,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      block_ends_at: new Date(end.getTime() + service.bufferMin * 60000).toISOString(),
      customer_tz: input.customerTz,
      manage_token_hash: hash,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23P01") return { ok: false, reason: "taken" };
    console.error("[booking] reserve failed:", error.code, error.message);
    return { ok: false, reason: "error" };
  }
  return { ok: true, bookingId: data.id, token };
}

export function manageUrl(token: string): string {
  return `${origin()}/b/${token}`;
}

/** Queue the reminder email (sent by the automation jobs runner) if the booking is far enough out. */
export async function scheduleReminder(input: {
  bookingId: string;
  workspaceId: string;
  moduleId: string;
  submissionId: string;
  businessName: string;
  start: Date;
  setup: BookingSetup;
  customerTz: string | null;
  serviceName: string;
  to: string | null;
  customerName: string;
  token: string;
}): Promise<void> {
  if (!input.to) return;
  const runAt = new Date(input.start.getTime() - REMINDER_HOURS * 3600e3);
  if (runAt.getTime() < Date.now() + 30 * 60000) return; // booked too close to bother
  const when = whenText(input.start, input.setup, input.customerTz);
  const body =
    `Hi {{customer_first_name}},\n\n` +
    `This is a reminder of your ${input.serviceName} with {{business_name}}:\n\n` +
    `${when}${input.setup.locationNote ? `\n${input.setup.locationNote}` : ""}\n\n` +
    `Need to change it? ${manageUrl(input.token)}\n\nSee you then!`;
  const db = modulesServiceClient();
  const { data: job, error } = await db
    .from("vw_scheduled_jobs")
    .insert({
      workspace_id: input.workspaceId,
      submission_id: input.submissionId,
      kind: "booking_reminder",
      run_at: runAt.toISOString(),
      payload: {
        module_id: input.moduleId,
        to: input.to,
        name: input.customerName,
        subject: `Reminder: ${input.serviceName} with {{business_name}}, ${formatWhen(input.start, input.customerTz || input.setup.timeZone)}`,
        body,
      },
    })
    .select("id")
    .single();
  if (error) {
    console.error("[booking] reminder schedule failed:", error.message);
    return;
  }
  await db.from("vw_bookings").update({ reminder_job_id: job.id }).eq("id", input.bookingId);
}

async function cancelReminder(jobId: string | null) {
  if (!jobId) return;
  await modulesServiceClient().from("vw_scheduled_jobs").update({ status: "cancelled" }).eq("id", jobId).eq("status", "pending");
}

async function notifyOwner(workspaceId: string, subject: string, text: string) {
  const db = modulesServiceClient();
  const { data: ws } = await db.from("vw_workspaces").select("notification_email").eq("id", workspaceId).single();
  const key = process.env.RESEND_API_KEY;
  if (!ws?.notification_email || !key) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "VisionWorkx <notifications@notify.revalorllc.com>", to: [ws.notification_email], subject, text }),
  }).catch(() => null);
  if (res && !res.ok) console.error("[booking] owner email failed:", res.status);
}

// ── manage link (customer) ──────────────────────────────────────────────────

export interface ManagedBooking {
  id: string;
  workspaceId: string;
  moduleId: string;
  modulePublicId: string;
  submissionId: string | null;
  businessName: string;
  workspaceSlug: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  customerTz: string | null;
  serviceId: string;
  serviceName: string;
  reminderJobId: string | null;
  setup: BookingSetup;
  service: BookingService | null;
  customerName: string;
  customerEmail: string | null;
}

export async function bookingByToken(token: string): Promise<ManagedBooking | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return loadBooking("manage_token_hash", hashToken(token));
}

/** Owner actions: a booking by id, only if it belongs to the workspace. */
export async function bookingForWorkspace(workspaceId: string, id: string): Promise<ManagedBooking | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const b = await loadBooking("id", id);
  return b && b.workspaceId === workspaceId ? b : null;
}

async function loadBooking(column: "id" | "manage_token_hash", value: string): Promise<ManagedBooking | null> {
  const db = modulesServiceClient();
  const { data: b } = await db
    .from("vw_bookings")
    .select(
      "id, workspace_id, module_id, submission_id, status, starts_at, ends_at, customer_tz, service_id, service_name, reminder_job_id, vw_modules!inner(public_id, type, config), vw_workspaces!inner(name, slug, time_zone)",
    )
    .eq(column, value)
    .maybeSingle();
  if (!b) return null;
  const mod = (Array.isArray(b.vw_modules) ? b.vw_modules[0] : b.vw_modules) as { public_id: string; type: string; config: Record<string, unknown> | null };
  const ws = (Array.isArray(b.vw_workspaces) ? b.vw_workspaces[0] : b.vw_workspaces) as { name: string; slug: string; time_zone: string };
  if (!isBookingModule(mod.type)) return null;
  const setup = parseBookingSetup(mod.config?.booking, ws.time_zone);
  let customerName = "";
  let customerEmail: string | null = null;
  if (b.submission_id) {
    const { data: s } = await db.from("vw_submissions").select("data").eq("id", b.submission_id).maybeSingle();
    const data = (s?.data ?? {}) as Record<string, unknown>;
    customerName = typeof data.name === "string" ? data.name : "";
    customerEmail = submissionEmail(data);
  }
  return {
    id: b.id,
    workspaceId: b.workspace_id,
    moduleId: b.module_id,
    modulePublicId: mod.public_id,
    submissionId: b.submission_id,
    businessName: ws.name,
    workspaceSlug: ws.slug,
    status: b.status,
    startsAt: new Date(b.starts_at),
    endsAt: new Date(b.ends_at),
    customerTz: b.customer_tz,
    serviceId: b.service_id,
    serviceName: b.service_name,
    reminderJobId: b.reminder_job_id,
    setup,
    service: setup.services.find((s) => s.id === b.service_id) ?? null,
    customerName,
    customerEmail,
  };
}

export async function cancelBooking(b: ManagedBooking, by: "customer" | "owner"): Promise<{ ok: boolean; error?: string }> {
  if (b.status !== "confirmed") return { ok: false, error: "This booking is already cancelled." };
  if (by === "customer" && !canChange(b.setup, b.startsAt, new Date())) {
    return { ok: false, error: `Changes need at least ${b.setup.cancelCutoffHours} hours' notice. Please contact ${b.businessName} directly.` };
  }
  const { data, error } = await modulesServiceClient()
    .from("vw_bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", b.id)
    .eq("status", "confirmed")
    .select("id");
  if (error || !data?.length) return { ok: false, error: "Couldn't cancel — please try again." };
  await cancelReminder(b.reminderJobId);
  if (b.submissionId) {
    await modulesServiceClient().from("vw_submissions").update({ status: "lost" }).eq("id", b.submissionId).eq("status", "new");
  }
  if (by === "owner" && b.customerEmail && process.env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${b.businessName.replace(/[<>"]/g, "").slice(0, 60)} via VisionWorkx <notifications@notify.revalorllc.com>`,
        to: [b.customerEmail],
        subject: `Your ${b.serviceName} on ${formatWhen(b.startsAt, b.customerTz || b.setup.timeZone)} was cancelled`,
        text:
          `Hi ${b.customerName.split(/\s+/)[0] || "there"},\n\n` +
          `${b.businessName} had to cancel your ${b.serviceName} on ${formatWhen(b.startsAt, b.customerTz || b.setup.timeZone)}. ` +
          `Sorry for the trouble — please book another time on their website, or reply to them directly.\n`,
      }),
    }).catch(() => null);
    if (res && !res.ok) console.error("[booking] customer cancel email failed:", res.status);
  }
  if (by === "customer") {
    await notifyOwner(
      b.workspaceId,
      `Cancelled: ${b.serviceName}, ${formatWhen(b.startsAt, b.setup.timeZone)}`,
      `${b.customerName || b.customerEmail || "A customer"} cancelled their ${b.serviceName} on ${formatWhen(b.startsAt, b.setup.timeZone)}. The time is open again.\n\nBookings: ${origin()}/workspace/${b.workspaceSlug}/bookings`,
    );
  }
  return { ok: true };
}

export async function rescheduleBooking(b: ManagedBooking, newStart: Date): Promise<{ ok: boolean; error?: string }> {
  if (b.status !== "confirmed") return { ok: false, error: "This booking is cancelled — book a new time instead." };
  if (!b.service) return { ok: false, error: `This service is no longer offered. Please contact ${b.businessName}.` };
  if (!canChange(b.setup, b.startsAt, new Date())) {
    return { ok: false, error: `Changes need at least ${b.setup.cancelCutoffHours} hours' notice. Please contact ${b.businessName} directly.` };
  }
  const dayMs = 86400e3;
  const busy = await busyRanges(b.workspaceId, new Date(newStart.getTime() - dayMs), new Date(newStart.getTime() + dayMs), b.id);
  if (!isSlotAvailable(b.setup, b.service, newStart, busy, new Date())) return { ok: false, error: "That time isn't available — pick another." };
  const end = new Date(newStart.getTime() + b.service.durationMin * 60000);
  const { error } = await modulesServiceClient()
    .from("vw_bookings")
    .update({
      starts_at: newStart.toISOString(),
      ends_at: end.toISOString(),
      block_ends_at: new Date(end.getTime() + b.service.bufferMin * 60000).toISOString(),
    })
    .eq("id", b.id)
    .eq("status", "confirmed");
  if (error) {
    if (error.code === "23P01") return { ok: false, error: "Someone just took that time — pick another." };
    return { ok: false, error: "Couldn't move the booking — please try again." };
  }
  // Keep the submission's "When" in step, and move the reminder.
  if (b.submissionId) {
    const db = modulesServiceClient();
    const { data: s } = await db.from("vw_submissions").select("data").eq("id", b.submissionId).maybeSingle();
    if (s) await db.from("vw_submissions").update({ data: { ...(s.data as object), bk_when: whenText(newStart, b.setup, b.customerTz) } }).eq("id", b.submissionId);
  }
  await cancelReminder(b.reminderJobId);
  await notifyOwner(
    b.workspaceId,
    `Rescheduled: ${b.serviceName} → ${formatWhen(newStart, b.setup.timeZone)}`,
    `${b.customerName || b.customerEmail || "A customer"} moved their ${b.serviceName} from ${formatWhen(b.startsAt, b.setup.timeZone)} to ${formatWhen(newStart, b.setup.timeZone)}.\n\nBookings: ${origin()}/workspace/${b.workspaceSlug}/bookings`,
  );
  return { ok: true };
}

/** Queue a fresh reminder after a reschedule. Only the token's hash is stored, so the caller passes the token it holds. */
export async function rescheduleReminder(b: ManagedBooking, newStart: Date, token: string) {
  if (!b.submissionId) return;
  await scheduleReminder({
    bookingId: b.id,
    workspaceId: b.workspaceId,
    moduleId: b.moduleId,
    submissionId: b.submissionId,
    businessName: b.businessName,
    start: newStart,
    setup: b.setup,
    customerTz: b.customerTz,
    serviceName: b.serviceName,
    to: b.customerEmail,
    customerName: b.customerName,
    token,
  });
}

