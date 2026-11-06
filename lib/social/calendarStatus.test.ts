import { describe, expect, it } from "vitest";
import { calendarStatus } from "./calendarStatus";

describe("calendarStatus", () => {
  const at = "2026-11-07T14:00:00Z";
  it("shows posts waiting on their image or video as scheduled", () => {
    expect(calendarStatus({ status: "approved", scheduled_at: at })).toBe("scheduled");
    expect(calendarStatus({ status: "draft", scheduled_at: at, auto_image: true })).toBe("scheduled");
    expect(calendarStatus({ status: "draft", scheduled_at: at, video_asset_id: "v" })).toBe("scheduled");
  });
  it("leaves real drafts, scheduled and posted posts alone", () => {
    expect(calendarStatus({ status: "draft", scheduled_at: null })).toBe("draft");
    expect(calendarStatus({ status: "draft", scheduled_at: at })).toBe("draft");
    expect(calendarStatus({ status: "approved", scheduled_at: null })).toBe("approved");
    expect(calendarStatus({ status: "scheduled", scheduled_at: at })).toBe("scheduled");
    expect(calendarStatus({ status: "posted", scheduled_at: at })).toBe("posted");
  });
});
