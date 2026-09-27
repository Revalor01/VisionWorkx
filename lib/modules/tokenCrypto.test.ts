import { randomBytes } from "crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { decryptToken, encryptToken, signState, verifyState } from "./tokenCrypto";

beforeAll(() => {
  process.env.CALENDAR_TOKEN_KEY = randomBytes(32).toString("base64");
});

describe("token encryption", () => {
  it("round-trips and never stores the plain token", () => {
    const enc = encryptToken("1//refresh-token");
    expect(enc).not.toContain("refresh-token");
    expect(decryptToken(enc)).toBe("1//refresh-token");
  });
  it("uses a fresh IV each time", () => expect(encryptToken("same")).not.toBe(encryptToken("same")));
  it("rejects tampering", () => {
    const [v, iv, tag, data] = encryptToken("secret").split(".");
    const flipped = data[0] === "A" ? `B${data.slice(1)}` : `A${data.slice(1)}`;
    expect(() => decryptToken([v, iv, tag, flipped].join("."))).toThrow();
    expect(() => decryptToken("junk")).toThrow();
  });
});

describe("oauth state", () => {
  it("verifies its own signature", () => {
    const s = signState({ w: "ws", n: "nonce" });
    expect(verifyState<{ w: string }>(s)?.w).toBe("ws");
  });
  it("rejects a modified payload or signature", () => {
    const [, sig] = signState({ w: "ws" }).split(".");
    const forged = Buffer.from(JSON.stringify({ w: "other" })).toString("base64url");
    expect(verifyState(`${forged}.${sig}`)).toBeNull();
    expect(verifyState("")).toBeNull();
    expect(verifyState("a.b")).toBeNull();
  });
});
