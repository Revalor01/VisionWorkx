import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

// go.revalorllc.com only serves /go/<code>; everything else on that host
// goes to revalorllc.com. Other hosts are unaffected.
const req = (url: string) => new NextRequest(url, { headers: { host: new URL(url).host } });

describe("short-link host", () => {
  it("lets /go/<code> through", async () => {
    const res = await middleware(req("https://go.revalorllc.com/go/AbC123x"));
    expect(res.headers.get("location")).toBeNull();
  });

  it.each(["/", "/admin", "/login", "/api/admin/marketing/campaigns", "/go", "/go/bad-code!"])("sends %s on the short host to revalorllc.com", async (path) => {
    const res = await middleware(req(`https://go.revalorllc.com${path}`));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://revalorllc.com/");
  });

  it("also locks the fully-qualified host (trailing dot) and any port", async () => {
    for (const host of ["go.revalorllc.com.", "GO.revalorllc.com:443"]) {
      const res = await middleware(new NextRequest("https://go.revalorllc.com/admin", { headers: { host } }));
      expect(res.headers.get("location")).toBe("https://revalorllc.com/");
    }
  });

  it("doesn't touch /go/ links on the app's own host", async () => {
    const res = await middleware(req("https://vision-workx.vercel.app/go/AbC123x"));
    expect(res.headers.get("location")).toBeNull();
  });
});
