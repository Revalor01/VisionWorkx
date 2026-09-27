import { describe, expect, it } from "vitest";
import { emailFromIdToken, eventBody, GOOGLE_SCOPES, hasScopes, parseFreeBusy, withoutOwnEvent } from "./googleCalendar";

const at = (s: string) => new Date(s);

describe("google calendar scopes", () => {
  it("requests only the narrow calendar scopes", () => {
    expect(GOOGLE_SCOPES).toContain("https://www.googleapis.com/auth/calendar.events.owned");
    expect(GOOGLE_SCOPES).toContain("https://www.googleapis.com/auth/calendar.freebusy");
    expect(GOOGLE_SCOPES).not.toContain("https://www.googleapis.com/auth/calendar");
    expect(GOOGLE_SCOPES).not.toContain("https://www.googleapis.com/auth/calendar.readonly");
  });

  it("requires both calendar permissions to be granted", () => {
    const both = "openid email https://www.googleapis.com/auth/calendar.events.owned https://www.googleapis.com/auth/calendar.freebusy";
    expect(hasScopes(both)).toBe(true);
    expect(hasScopes("openid email https://www.googleapis.com/auth/calendar.freebusy")).toBe(false);
    expect(hasScopes("")).toBe(false);
  });
});

describe("emailFromIdToken", () => {
  const token = (claims: object) => `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
  it("reads the email claim", () => expect(emailFromIdToken(token({ email: "owner@example.com" }))).toBe("owner@example.com"));
  it("tolerates missing or junk tokens", () => {
    expect(emailFromIdToken(undefined)).toBeNull();
    expect(emailFromIdToken("nope")).toBeNull();
    expect(emailFromIdToken("a.!!!.b")).toBeNull();
    expect(emailFromIdToken(token({}))).toBeNull();
  });
});

describe("parseFreeBusy", () => {
  it("returns the calendar's busy ranges and drops junk", () => {
    const busy = parseFreeBusy(
      {
        calendars: {
          primary: {
            busy: [
              { start: "2026-10-05T13:00:00Z", end: "2026-10-05T14:00:00Z" },
              { start: "garbage", end: "2026-10-05T15:00:00Z" },
              { start: "2026-10-05T16:00:00Z", end: "2026-10-05T16:00:00Z" },
            ],
          },
        },
      },
      "primary",
    );
    expect(busy).toEqual([{ start: at("2026-10-05T13:00:00Z"), end: at("2026-10-05T14:00:00Z") }]);
  });
  it("is empty for an empty response", () => expect(parseFreeBusy({}, "primary")).toEqual([]));
});

describe("withoutOwnEvent", () => {
  const own = { start: at("2026-10-05T13:00:00Z"), end: at("2026-10-05T13:30:00Z") };
  it("drops the moving booking's own event", () => {
    expect(withoutOwnEvent([{ ...own }], own)).toEqual([]);
  });
  it("keeps a range that also covers another event", () => {
    const merged = { start: at("2026-10-05T12:30:00Z"), end: at("2026-10-05T13:30:00Z") };
    expect(withoutOwnEvent([merged], own)).toEqual([merged]);
  });
  it("is a no-op with nothing to exclude", () => {
    const b = [{ ...own }];
    expect(withoutOwnEvent(b, null)).toBe(b);
  });
});

describe("eventBody", () => {
  const base = {
    id: "b1",
    workspaceId: "w1",
    workspaceSlug: "acme",
    serviceName: "Consultation",
    startsAt: at("2026-10-05T13:00:00Z"),
    endsAt: at("2026-10-05T13:30:00Z"),
    locationNote: "123 Main St",
    gcalEventId: null,
    dashboardUrl: "https://modules.revalorllc.com/workspace/acme/bookings",
  };
  it("titles the event with the service and customer, with contact details inside", () => {
    const ev = eventBody({ ...base, customer: { name: "Jo Smith", email: "jo@example.com", phone: "555-0100", bk_when: "x" } });
    expect(ev.summary).toBe("Consultation — Jo Smith");
    expect(ev.description).toContain("Email: jo@example.com");
    expect(ev.description).toContain("Phone: 555-0100");
    expect(ev.description).toContain(base.dashboardUrl);
    expect(ev.location).toBe("123 Main St");
    expect(ev.start.dateTime).toBe("2026-10-05T13:00:00.000Z");
    expect(ev.extendedProperties.private.vwBookingId).toBe("b1");
  });
  it("copes with no customer details", () => {
    const ev = eventBody({ ...base, locationNote: "", customer: {} });
    expect(ev.summary).toBe("Consultation");
    expect(ev).not.toHaveProperty("location");
    expect(ev.description).not.toContain("undefined");
  });
});
