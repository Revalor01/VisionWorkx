import { afterEach, describe, expect, it } from "vitest";
import { domainsFromWebsite, selfServeEnabled, slugBase } from "./selfServe";

describe("selfServeEnabled", () => {
  const prev = process.env.SELF_SERVE_SIGNUP;
  afterEach(() => {
    if (prev === undefined) delete process.env.SELF_SERVE_SIGNUP;
    else process.env.SELF_SERVE_SIGNUP = prev;
  });
  it("is off unless explicitly 'true'", () => {
    delete process.env.SELF_SERVE_SIGNUP;
    expect(selfServeEnabled()).toBe(false);
    process.env.SELF_SERVE_SIGNUP = "1";
    expect(selfServeEnabled()).toBe(false);
    process.env.SELF_SERVE_SIGNUP = "true";
    expect(selfServeEnabled()).toBe(true);
  });
});

describe("slugBase", () => {
  it("makes URL-safe slugs", () => {
    expect(slugBase("Joe's Plumbing & Heating")).toBe("joe-s-plumbing-heating");
    expect(slugBase("Café Déjà Vu")).toBe("cafe-deja-vu");
  });
  it("pads short names and avoids reserved words", () => {
    expect(slugBase("AB")).toBe("ab-co");
    expect(slugBase("!!!")).toBe("biz-co");
    expect(slugBase("Admin")).toBe("admin-co");
    expect(slugBase("Workspace")).toBe("workspace-co");
  });
  it("caps length without a trailing dash", () => {
    const s = slugBase("a".repeat(39) + " bcdef");
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("domainsFromWebsite", () => {
  it("adds the www twin", () => {
    expect(domainsFromWebsite("https://joesplumbing.com/contact").sort()).toEqual(["joesplumbing.com", "www.joesplumbing.com"]);
    expect(domainsFromWebsite("www.joesplumbing.com").sort()).toEqual(["joesplumbing.com", "www.joesplumbing.com"]);
  });
  it("returns nothing for no website", () => {
    expect(domainsFromWebsite("")).toEqual([]);
  });
});
