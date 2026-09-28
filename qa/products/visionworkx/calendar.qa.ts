import { expect, qa, test } from "../../lib/qa";
import { connectQaCalendar, createModule, createTestWorkspace, modulesAdmin, waitFor } from "../../lib/modules";
import { book, bookingConfig, manageBooking, manageToken, openSlots } from "../../lib/booking";

// Google Calendar sync, using the QA Google account (revalor.qa@gmail.com)
// through a copy of its saved connection. The runner never talks to Google
// itself: we watch what the app does (event ids it stores, slots it offers).
//
// Events these tests create are removed again by cancelling the bookings,
// even when a step fails (finally blocks).

const GOOGLE_TIMEOUT = 45_000; // event writes run after the response; Google can take a few seconds

async function eventId(bookingId: string): Promise<string | null> {
  const { data } = await modulesAdmin().from("vw_bookings").select("gcal_event_id").eq("id", bookingId).single();
  return (data?.gcal_event_id as string | null) ?? null;
}

async function bookingIdFor(workspaceId: string): Promise<string> {
  const b = await waitFor(async () => {
    const { data } = await modulesAdmin().from("vw_bookings").select("id").eq("workspace_id", workspaceId).eq("status", "confirmed").maybeSingle();
    return data;
  }, "the booking row");
  return b.id as string;
}

qa(
  {
    id: "visionworkx/calendar/bookings-sync-to-google",
    area: "Google Calendar",
    title: "Bookings are added, moved and removed on the owner's Google Calendar",
    requires: ["google-qa"],
  },
  async ({ request, qaWorkspace }) => {
    test.setTimeout(3 * 60_000);
    await connectQaCalendar(qaWorkspace.id);
    const mod = await createModule(qaWorkspace.id, "booking", bookingConfig());
    const slots = await openSlots(request, mod.publicId, 14);
    const r = await book(request, mod.publicId, slots[0]);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    const token = manageToken(r.json);
    const bookingId = await bookingIdFor(qaWorkspace.id);
    let cancelled = false;

    try {
      const created = await test.step("event is created", async () =>
        waitFor(() => eventId(bookingId), "the Google event id", GOOGLE_TIMEOUT),
      );

      await test.step("rescheduling moves the same event", async () => {
        const m = await manageBooking(request, token, { action: "reschedule", start: slots[4] });
        expect(m.status, JSON.stringify(m.json)).toBe(200);
        // Give the after-response update time to run; the event id must survive it.
        await new Promise((res) => setTimeout(res, 8_000));
        expect(await eventId(bookingId)).toBe(created);
      });

      await test.step("cancelling removes the event", async () => {
        const m = await manageBooking(request, token, { action: "cancel" });
        expect(m.status, JSON.stringify(m.json)).toBe(200);
        cancelled = true;
        await waitFor(async () => ((await eventId(bookingId)) === null ? true : null), "the event to be removed", GOOGLE_TIMEOUT);
      });
    } finally {
      if (!cancelled) {
        await manageBooking(request, token, { action: "cancel" }).catch(() => undefined);
        await new Promise((res) => setTimeout(res, 5_000)); // let the event removal run before the workspace is deleted
      }
    }
  },
);

qa(
  {
    id: "visionworkx/calendar/busy-times-block-slots",
    area: "Google Calendar",
    title: "Busy times on the owner's calendar aren't offered, and open up again",
    requires: ["google-qa"],
  },
  async ({ request, qaWorkspace }) => {
    test.setTimeout(5 * 60_000);
    // Two businesses sharing the QA calendar: a booking in A becomes a calendar
    // event, which must show up as a busy time for B (B has no bookings of its own).
    const other = await createTestWorkspace(`${test.info().testId}-b`);
    let token: string | null = null;
    try {
      await connectQaCalendar(qaWorkspace.id);
      await connectQaCalendar(other.id);
      const a = await createModule(qaWorkspace.id, "booking", bookingConfig());
      const b = await createModule(other.id, "booking", bookingConfig());

      const slot = (await openSlots(request, b.publicId, 14))[2];
      expect(slot, "B offers the time before it's taken").toBeTruthy();
      const r = await book(request, a.publicId, slot);
      expect(r.status, JSON.stringify(r.json)).toBe(200);
      token = manageToken(r.json);
      const bookingId = await bookingIdFor(qaWorkspace.id);

      await test.step("A's booking lands on the calendar", async () => {
        await waitFor(() => eventId(bookingId), "the Google event id", GOOGLE_TIMEOUT);
      });

      await test.step("B no longer offers that time", async () => {
        await waitFor(async () => (!(await openSlots(request, b.publicId, 14)).includes(slot) ? true : null), "B to hide the busy time", 90_000);
      });

      await test.step("after A cancels, B offers it again", async () => {
        const m = await manageBooking(request, token!, { action: "cancel" });
        expect(m.status, JSON.stringify(m.json)).toBe(200);
        token = null;
        await waitFor(async () => ((await eventId(bookingId)) === null ? true : null), "the event to be removed", GOOGLE_TIMEOUT);
        // Busy times are cached for up to a minute per server instance.
        await waitFor(async () => ((await openSlots(request, b.publicId, 14)).includes(slot) ? true : null), "B to offer the time again", 150_000);
      });
    } finally {
      if (token) {
        await manageBooking(request, token, { action: "cancel" }).catch(() => undefined);
        await new Promise((res) => setTimeout(res, 5_000)); // let the event removal run before the workspace is deleted
      }
      await other.cleanup();
    }
  },
);
