import { expect, type APIRequestContext } from "@playwright/test";
import { EMAIL_FIELD, formConfig, NAME_FIELD, QA_HOST, submitViaApi, target } from "./modules";
import { localDate } from "../../lib/modules/booking";

// Shared booking-module setup for booking and calendar tests.

export const TZ = "America/New_York";
export const NOTICE_HOURS = 12;
export { EMAIL_FIELD, NAME_FIELD };

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export const today = () => localDate(new Date(), TZ);
export const dayOff = () => addDays(today(), 3);

/** One 30-minute service (15-minute buffer), 9–5 every day, one day off, 12h notice. */
export function bookingConfig(fields: Record<string, unknown>[] = [NAME_FIELD]) {
  return {
    ...formConfig(fields, { submitLabel: "Book", successMessage: "You're booked — QA." }),
    booking: {
      services: [{ id: "consult", name: "QA consult", durationMin: 30, bufferMin: 15, priceLabel: "Free", description: "" }],
      weekly: Array.from({ length: 7 }, () => [{ start: "09:00", end: "17:00" }]),
      daysOff: [dayOff()],
      minNoticeHours: NOTICE_HOURS,
      maxDaysAhead: 30,
      slotStepMin: 30,
      cancelCutoffHours: 1,
      timeZone: TZ,
      locationNote: "QA test booking",
    },
  };
}

export async function openSlots(request: APIRequestContext, publicId: string, days = 7, from = today()): Promise<string[]> {
  const res = await request.get(`${target()}/api/m/${publicId}/slots?service=consult&from=${from}&days=${days}`, {
    headers: { Origin: `https://${QA_HOST}` },
  });
  expect(res.status(), "slots API").toBe(200);
  return ((await res.json()) as { slots: string[] }).slots;
}

export async function book(request: APIRequestContext, publicId: string, start: string, data: Record<string, string> = { name: "QA Booker" }) {
  return submitViaApi(request, publicId, { data, booking: { serviceId: "consult", start, timeZone: TZ } });
}

/** The manage-link token from a successful booking response. */
export function manageToken(json: Record<string, unknown>): string {
  const url = (json.booking as { manageUrl?: string } | undefined)?.manageUrl;
  if (!url) throw new Error(`No manage link in the booking response: ${JSON.stringify(json)}`);
  return new URL(url).pathname.split("/").pop()!;
}

/** Customer's reschedule/cancel via their manage link, as the manage page does. */
export async function manageBooking(request: APIRequestContext, token: string, body: { action: "cancel" } | { action: "reschedule"; start: string }) {
  const res = await request.post(`${target()}/api/b/${token}`, { headers: { Origin: target(), "Content-Type": "application/json" }, data: body });
  return { status: res.status(), json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}
