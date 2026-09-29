import type { Catalog, LogoSlot } from "./types";

// Logos default to the official files on products.revalorllc.com (the same ones
// the offline app downloads). Catalog & pricing can point a slot at another
// address, or clear it to hide that logo.
export const DEFAULT_LOGOS: Record<LogoSlot, string> = {
  business: "https://products.revalorllc.com/assets/revalor-business-logo.png",
  consulting: "https://products.revalorllc.com/assets/revalor-consulting-logo.png",
  visionworkx: "https://products.revalorllc.com/assets/visionworkx-logo.png",
  automation: "https://products.revalorllc.com/assets/visionworkx-automation-logo.png",
  proactive: "https://products.revalorllc.com/assets/proactive-logo.png",
  badge: "https://products.revalorllc.com/assets/revalor-veteran-owned-badge.png",
};

export const LOGO_LABELS: Record<LogoSlot, [string, string]> = {
  business: ["Revalor Business logo", "Top of the analyzer, and the proposal if no Consulting logo is set"],
  consulting: ["Revalor Consulting logo", "Proposal header"],
  visionworkx: ["VisionWorkx logo", "Next to VisionWorkx modules in plans and proposals"],
  automation: ["VisionWorkx Automation logo (optional)", "Next to VisionWorkx Automation"],
  proactive: ["Proactive logo (optional)", "Next to Proactive Leadership Coaching"],
  badge: ["Veteran-Owned badge (optional)", "Proposal header, next to your contact details"],
};

/** The image address for a slot, or null when it's cleared or not a plain https address. */
export function logoUrl(catalog: Catalog, slot: LogoSlot): string | null {
  const set = catalog.settings?.logos?.[slot];
  const url = set === undefined ? DEFAULT_LOGOS[slot] : set;
  return url && /^https:\/\/[^\s"'<>]+$/i.test(url) ? url : null;
}

/** Which logo sits next to a plan item, if any. */
export function moduleLogoSlot(catalog: Catalog, it: { id: string; category: string }): LogoSlot | null {
  if (it.id === "vw-auto") return logoUrl(catalog, "automation") ? "automation" : "visionworkx";
  if (it.id === "proactive") return "proactive";
  return it.category === "VisionWorkx" ? "visionworkx" : null;
}
