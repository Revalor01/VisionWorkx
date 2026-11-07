import { describe, expect, it } from "vitest";
import { applyProductRule, productOfUrl, resolvePostProduct } from "@/lib/social/productRule";

const post = (o: Partial<{ link_url: string | null; hook: string | null; caption: string; video: boolean }> = {}) => ({ link_url: null, hook: null, caption: "", video: false, ...o });

describe("productOfUrl", () => {
  it("reads the products-site #fragment or a product subdomain", () => {
    expect(productOfUrl("https://products.revalorllc.com/wellness#sanctum")).toBe("sanctum");
    expect(productOfUrl("https://products.revalorllc.com/business#revalor_consulting")).toBe("consulting");
    expect(productOfUrl("https://sanctum.revalorllc.com/start")).toBe("sanctum");
    expect(productOfUrl("https://products.revalorllc.com/wellness")).toBeNull();
    expect(productOfUrl(null)).toBeNull();
  });
});

describe("resolvePostProduct", () => {
  it("prefers the link, then the brand's product named first, then the brand's only product", () => {
    expect(resolvePostProduct(post({ link_url: "https://products.revalorllc.com/wellness#elevate", caption: "Sanctum..." }), "Revalor Wellness")).toBe("elevate");
    expect(resolvePostProduct(post({ caption: "Elevate flips that. Unlike Sanctum..." }), "Revalor Wellness")).toBe("elevate");
    expect(resolvePostProduct(post({ caption: "Watch this." }), "VisionWorkx")).toBe("visionworkx");
  });
  it("can't tell when a multi-product brand names none", () => {
    expect(resolvePostProduct(post({ caption: "Some days the chatter doesn't stop." }), "Revalor Wellness")).toBeNull();
    expect(resolvePostProduct(post({ caption: "5 things to never paste into AI." }), "Revalor LLC")).toBeNull();
  });
});

describe("applyProductRule", () => {
  it("swaps a brand-page link for the product's page", () => {
    const r = applyProductRule(post({ link_url: "https://products.revalorllc.com/wellness", caption: "Sanctum gives you a few minutes a day." }), "Revalor Wellness");
    expect(r).toMatchObject({ ok: true, product: "sanctum", link: "https://products.revalorllc.com/wellness#sanctum" });
  });
  it("keeps a link that already points at the product", () => {
    const r = applyProductRule(post({ link_url: "https://sanctum.revalorllc.com/?src=fb", caption: "Sanctum is free." }), "Revalor Wellness");
    expect(r.ok && r.link).toBe("https://sanctum.revalorllc.com/?src=fb");
  });
  it("names the product in a video's title and the visible start of the caption", () => {
    const caption = "Here's what most resolutions get wrong: they ask you to change everything at once, all at the same time, forever and ever. Elevate works differently.";
    const r = applyProductRule(post({ link_url: "https://products.revalorllc.com/wellness#elevate", hook: "Self-improvement needs one short cycle.", caption, video: true }), "Revalor Wellness");
    expect(r.ok && r.hook).toBe("Elevate: Self-improvement needs one short cycle.");
    expect(r.ok && r.caption.startsWith("Elevate — try it free.\n\n")).toBe(true);
  });
  it("leaves copy alone when the product is already up front", () => {
    const r = applyProductRule(post({ hook: "Sanctum for veterans", caption: "Sanctum gives you a few minutes.", video: true }), "Revalor Wellness");
    expect(r).toMatchObject({ ok: true, hook: "Sanctum for veterans", caption: "Sanctum gives you a few minutes." });
  });
  it("blocks a post that promotes no product", () => {
    expect(applyProductRule(post({ caption: "Ever notice AI getting worse the longer a chat goes on?" }), "Revalor LLC").ok).toBe(false);
  });
});
