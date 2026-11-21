import { describe, expect, it } from "vitest";
import { REVALOR_ADMIN, localHref, localizeNav, sectionForPath, type RevalorNav } from "./revalorNav";

const sso = (next: string, target = "visionworkx") => `/api/admin/sso/issue?target=${target}&next=${encodeURIComponent(next)}`;

const RAW: RevalorNav = {
  categories: [
    {
      key: "consulting",
      label: "Consulting",
      hex: "#0EA5E9",
      links: [
        { key: "consulting", label: "Clients", href: "/consulting" },
        {
          key: "needs-analyzer",
          label: "Needs Analyzer",
          href: "/api/admin/sso/issue?target=visionworkx&next=/admin/needs-analyzer",
          sub: [
            { key: "assessments", label: "Assessments", href: sso("/admin/needs-analyzer") },
            { key: "website", label: "Website check", href: sso("/admin/needs-analyzer/website") },
          ],
        },
      ],
    },
    { key: "media", label: "Media", hex: "#DC2626", links: [{ key: "marketing", label: "Email Marketing", href: sso("/admin/marketing") }] },
    { key: "metrics", label: "Metrics", hex: "#EA580C", links: [{ key: "social-metrics", label: "Social Metrics", href: sso("/admin/social?tab=performance") }] },
  ],
  quick: [{ key: "cfh", label: "CFH", href: "https://christian-friends-hub.vercel.app/", color: "#4F46E5", external: true, row: 2 }],
};

describe("localHref", () => {
  it("turns VisionWorkx SSO hops into local paths", () => {
    expect(localHref(sso("/admin/needs-analyzer/website"))).toBe("/admin/needs-analyzer/website");
    expect(localHref("/api/admin/sso/issue?target=visionworkx&next=/admin/qa")).toBe("/admin/qa");
  });
  it("sends revalor-admin pages and other apps' SSO hops to revalor-admin", () => {
    expect(localHref("/costs")).toBe(`${REVALOR_ADMIN}/costs`);
    expect(localHref(sso("/admin", "chorebit"))).toBe(`${REVALOR_ADMIN}${sso("/admin", "chorebit")}`);
  });
  it("leaves outside sites alone and refuses protocol-relative next paths", () => {
    expect(localHref("https://example.com/")).toBe("https://example.com/");
    expect(localHref("/api/admin/sso/issue?target=visionworkx&next=//evil.test")).toBe(`${REVALOR_ADMIN}/api/admin/sso/issue?target=visionworkx&next=//evil.test`);
  });
});

describe("sectionForPath", () => {
  const nav = localizeNav(RAW);
  it("matches a page by its longest local link or flyout tab", () => {
    expect(sectionForPath(nav, "/admin/needs-analyzer/website")).toMatchObject({ category: { key: "consulting" }, current: "needs-analyzer" });
    expect(sectionForPath(nav, "/admin/needs-analyzer/abc-123")).toMatchObject({ category: { key: "consulting" }, current: "needs-analyzer" });
    expect(sectionForPath(nav, "/admin/marketing/lifecycle")).toMatchObject({ category: { key: "media" }, current: "marketing" });
  });
  it("ignores query strings and returns null outside every section", () => {
    expect(sectionForPath(nav, "/admin/social")).toMatchObject({ category: { key: "metrics" }, current: "social-metrics" });
    expect(sectionForPath(nav, "/admin/modules")).toBeNull();
  });
});
