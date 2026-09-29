import { describe, expect, it } from "vitest";
import { decideSync, parseLocalAssessment, type LocalAssessment } from "./sync";

const local = (updatedAt: string): LocalAssessment => ({
  id: "abc123",
  status: "Draft",
  answers: {},
  overrides: {},
  createdAt: "2026-09-20T10:00:00.000Z",
  updatedAt,
});
const row = (updated_at: string, synced_at: string | null, deleted_at: string | null = null) => ({ id: "u", updated_at, synced_at, deleted_at });

describe("decideSync", () => {
  it("inserts assessments the server has never seen", () => {
    expect(decideSync(local("2026-09-21T10:00:00Z"), undefined)).toBe("insert");
  });

  it("leaves an untouched assessment alone", () => {
    expect(decideSync(local("2026-09-21T10:00:00Z"), row("2026-09-21T10:00:00Z", "2026-09-21T10:00:00Z"))).toBe("unchanged");
  });

  it("updates when only the laptop changed", () => {
    expect(decideSync(local("2026-09-22T10:00:00Z"), row("2026-09-21T10:00:00Z", "2026-09-21T10:00:00Z"))).toBe("update");
  });

  it("reports (not overwrites) when only the online copy changed", () => {
    expect(decideSync(local("2026-09-21T10:00:00Z"), row("2026-09-23T10:00:00Z", "2026-09-21T10:00:00Z"))).toBe("online-newer");
  });

  it("keeps the online copy when both changed, even if the laptop edit is newer", () => {
    expect(decideSync(local("2026-09-24T10:00:00Z"), row("2026-09-23T10:00:00Z", "2026-09-21T10:00:00Z"))).toBe("conflict");
  });

  it("never revives an assessment deleted online", () => {
    expect(decideSync(local("2026-09-24T10:00:00Z"), row("2026-09-21T10:00:00Z", "2026-09-21T10:00:00Z", "2026-09-22T10:00:00Z"))).toBe(
      "deleted-online",
    );
  });
});

describe("parseLocalAssessment", () => {
  it("accepts an offline assessment file", () => {
    const a = parseLocalAssessment({ id: "demo-plumbing", status: "Won", answers: { bizName: "X" }, overrides: {}, updatedAt: "2026-09-24T09:04:16.981Z" });
    expect(a).toMatchObject({ id: "demo-plumbing", status: "Won", createdAt: "2026-09-24T09:04:16.981Z" });
  });

  it("rejects bad ids, missing timestamps and non-object answers", () => {
    expect(parseLocalAssessment({ id: "../etc", updatedAt: "2026-09-24T09:04:16Z" })).toBeNull();
    expect(parseLocalAssessment({ id: "abcdef" })).toBeNull();
    expect(parseLocalAssessment({ id: "abcdef", updatedAt: "2026-09-24T09:04:16Z", answers: [] })).toBeNull();
  });
});
