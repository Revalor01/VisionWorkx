import { expect, qa, test } from "../../lib/qa";
import { createModule, modulesAdmin, openHostPage, resendTestAddress, signIn, target, waitFor } from "../../lib/modules";
import { book, bookingConfig, dayOff, EMAIL_FIELD, NAME_FIELD, NOTICE_HOURS, openSlots, TZ } from "../../lib/booking";
import { localDate, localParts } from "../../../lib/modules/booking";

// Online booking: which times are offered, booking through the widget,
// double-booking protection, and changes by the customer and the owner.

qa({ id: "visionworkx/booking/slots-follow-rules", area: "Booking", title: "Only open times are offered (hours, day off, notice)" }, async ({ request, qaWorkspace }) => {
  const mod = await createModule(qaWorkspace.id, "booking", bookingConfig());
  const slots = await openSlots(request, mod.publicId);
  expect(slots.length, "some times are offered").toBeGreaterThan(20);
  const earliest = Date.now() + NOTICE_HOURS * 3600e3 - 60_000;
  for (const iso of slots) {
    const d = new Date(iso);
    const p = localParts(d, TZ);
    expect(localDate(d, TZ), `${iso} is on the day off`).not.toBe(dayOff());
    expect(d.getTime(), `${iso} is inside the ${NOTICE_HOURS}h notice period`).toBeGreaterThanOrEqual(earliest);
    const minutes = p.hour * 60 + p.minute;
    expect(minutes, `${iso} starts before 9:00`).toBeGreaterThanOrEqual(9 * 60);
    expect(minutes + 30, `${iso} ends after 17:00`).toBeLessThanOrEqual(17 * 60);
    expect(p.minute % 30, `${iso} is off the 30-minute grid`).toBe(0);
  }
});

qa(
  { id: "visionworkx/booking/book-in-widget", area: "Booking", title: "Visitor books a time in the widget", smoke: true, mobile: true },
  async ({ page, request, qaWorkspace }) => {
    const mod = await createModule(qaWorkspace.id, "booking", bookingConfig());
    let picked = "";

    await test.step("pick a time and book", async () => {
      await openHostPage(page, mod.publicId);
      const form = page.frameLocator("iframe").first();
      const times = form.getByRole("group", { name: "Time" }).getByRole("button");
      await expect(times.first()).toBeVisible();
      await times.first().click();
      await form.getByRole("button", { name: "Continue" }).click();
      await form.getByLabel("Full name").fill("QA Widget Booker");
      await form.getByRole("button", { name: "Book" }).click();
      await expect(form.getByText("You're booked — QA.")).toBeVisible();
      await expect(form.getByRole("link", { name: "Change or cancel" })).toBeVisible();
    });

    await test.step("booking is stored", async () => {
      const b = await waitFor(async () => {
        const { data } = await modulesAdmin().from("vw_bookings").select("starts_at, status").eq("workspace_id", qaWorkspace.id).maybeSingle();
        return data;
      }, "the booking row");
      expect(b.status).toBe("confirmed");
      picked = new Date(b.starts_at).toISOString();
    });

    await test.step("that time and its buffer are no longer offered", async () => {
      const slots = await openSlots(request, mod.publicId);
      const next = new Date(new Date(picked).getTime() + 30 * 60_000).toISOString(); // inside the 15-min buffer after a 30-min booking
      expect(slots).not.toContain(picked);
      expect(slots).not.toContain(next);
    });
  },
);

qa({ id: "visionworkx/booking/no-double-booking", area: "Booking", title: "Two people can't book the same time" }, async ({ request, qaWorkspace }) => {
  const mod = await createModule(qaWorkspace.id, "booking", bookingConfig());
  const [slot] = await openSlots(request, mod.publicId);
  const [a, b] = await Promise.all([book(request, mod.publicId, slot, { name: "QA First" }), book(request, mod.publicId, slot, { name: "QA Second" })]);
  const statuses = [a.status, b.status].sort();
  expect(statuses, JSON.stringify([a.json, b.json])).toEqual([200, 409]);
  const loser = a.status === 409 ? a : b;
  expect(loser.json.code).toBe("slot_taken");
  const { count } = await modulesAdmin().from("vw_bookings").select("id", { count: "exact", head: true }).eq("workspace_id", qaWorkspace.id).eq("status", "confirmed");
  expect(count).toBe(1);
});

qa(
  { id: "visionworkx/booking/customer-reschedule-cancel", area: "Booking", title: "Customer reschedules, then cancels, from their link" },
  async ({ page, request, qaWorkspace }) => {
    const db = modulesAdmin();
    const mod = await createModule(qaWorkspace.id, "booking", bookingConfig());
    const [first] = await openSlots(request, mod.publicId);
    const r = await book(request, mod.publicId, first);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    const manage = new URL((r.json.booking as { manageUrl: string }).manageUrl);
    await page.goto(`${target()}${manage.pathname}`);

    await test.step("reschedule", async () => {
      await page.getByRole("button", { name: "Reschedule" }).click();
      const times = page.getByRole("group", { name: "Time" }).getByRole("button");
      await expect(times.first()).toBeVisible();
      await times.nth(3).click();
      await page.getByRole("button", { name: "Move my booking" }).click();
      await expect(page.getByText(/^Moved\./)).toBeVisible();
      const b = await waitFor(async () => {
        const { data } = await db.from("vw_bookings").select("starts_at").eq("workspace_id", qaWorkspace.id).single();
        return data && new Date(data.starts_at).toISOString() !== first ? data : null;
      }, "the new time to save");
      expect(new Date(b.starts_at).toISOString()).not.toBe(first);
    });

    await test.step("cancel", async () => {
      await page.getByRole("button", { name: "Cancel booking" }).click();
      await page.getByRole("button", { name: "Yes, cancel it" }).click();
      await expect(page.getByText(/^Cancelled\./)).toBeVisible();
      const { data } = await db.from("vw_bookings").select("status").eq("workspace_id", qaWorkspace.id).single();
      expect(data?.status).toBe("cancelled");
    });

    await test.step("the time is offered again", async () => {
      const slots = await openSlots(request, mod.publicId);
      expect(slots).toContain(first);
    });
  },
);

qa({ id: "visionworkx/booking/owner-cancel", area: "Booking", title: "Owner cancels a booking from the Bookings tab" }, async ({ page, context, request, qaWorkspace }) => {
  const mod = await createModule(qaWorkspace.id, "booking", bookingConfig());
  const [slot] = await openSlots(request, mod.publicId);
  const r = await book(request, mod.publicId, slot, { name: "QA Owner Cancel" });
  expect(r.status, JSON.stringify(r.json)).toBe(200);

  await signIn(context, qaWorkspace.owner);
  await page.goto(`/workspace/${qaWorkspace.slug}/bookings`);
  await page.getByRole("button", { name: "Cancel", exact: true }).first().click();
  await page.getByRole("button", { name: "Yes, cancel" }).click();
  await waitFor(async () => {
    const { data } = await modulesAdmin().from("vw_bookings").select("status").eq("workspace_id", qaWorkspace.id).single();
    return data?.status === "cancelled" ? data : null;
  }, "the booking to be cancelled");
});

qa(
  { id: "visionworkx/booking/reminder-queued", area: "Booking", title: "A reminder is queued 24 hours before the booking" },
  async ({ request, qaWorkspace }) => {
    const mod = await createModule(qaWorkspace.id, "booking", bookingConfig([NAME_FIELD, EMAIL_FIELD]));
    const slots = await openSlots(request, mod.publicId, 14);
    const later = slots.find((s) => new Date(s).getTime() > Date.now() + 30 * 3600e3);
    expect(later, "a time more than 30h away").toBeTruthy();
    const r = await book(request, mod.publicId, later!, { name: "QA Reminder", email: resendTestAddress("qareminder") });
    expect(r.status, JSON.stringify(r.json)).toBe(200);

    const job = await waitFor(async () => {
      const { data } = await modulesAdmin()
        .from("vw_scheduled_jobs")
        .select("kind, status, run_at")
        .eq("workspace_id", qaWorkspace.id)
        .eq("kind", "booking_reminder")
        .maybeSingle();
      return data;
    }, "the reminder job");
    expect(job.status).toBe("pending");
    expect(new Date(job.run_at).getTime()).toBe(new Date(later!).getTime() - 24 * 3600e3);
  },
);
