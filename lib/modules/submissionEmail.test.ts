import { describe, expect, it } from "vitest";
import { submissionEmail } from "./submissionEmail";

describe("submissionEmail", () => {
  it("prefers the email field", () => {
    expect(submissionEmail({ email: "a@b.co", other: "c@d.co" })).toBe("a@b.co");
  });
  it("finds emails stored under other ids (e.g. drafted email_address)", () => {
    expect(submissionEmail({ name: "Jo", email_address: " jo@example.org " })).toBe("jo@example.org");
  });
  it("ignores junk and files", () => {
    expect(submissionEmail({ email: "not-an-email", photo: { path: "x" } as unknown as string })).toBeNull();
    expect(submissionEmail(null)).toBeNull();
  });
});
