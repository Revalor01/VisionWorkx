// Website Builder tab helpers for the Needs Analyzer. Pure functions only: the
// presets and copy for the two build paths, and the client-safe proposal summary.
// Deliberately separate from rules.ts so module scoring — pinned by rules.test.ts
// and mirrored in the offline app — is never touched by this online-only feature.

import { money } from "./format";
import type { BuildPath, Catalog, WebsiteBuild } from "./types";

export const BUILDER_TOOLS = ["Squarespace", "Wix", "WordPress", "Webflow"] as const;

export const REGISTRARS = ["Cloudflare", "Namecheap", "Porkbun"] as const;

export const ACCESS_METHODS = ["Invite to their account", "Delegated DNS access"] as const;

export const DEFAULT_BUILD_DAYS = "1–3 days build + half a day domain & DNS";

export interface BuildPathPreset {
  key: BuildPath;
  label: string;
  /** One-line operator framing. */
  tagline: string;
  /** The trade-off, in the operator's words. */
  points: string[];
  /** The thing that most often bites on this path. */
  caveat: string;
}

export const BUILD_PATHS: BuildPathPreset[] = [
  {
    key: "builder",
    label: "Standard builder, in the client's account",
    tagline: "Squarespace, Wix, WordPress or Webflow — the client owns and pays for the site.",
    points: [
      "Client owns and pays for the site; you build through invite access.",
      "VisionWorkx modules get embedded later.",
      "Least ongoing work for Revalor.",
    ],
    caveat: "Matches the Website Enhancement direction; best fit for a first case-study client.",
  },
  {
    key: "custom",
    label: "Custom site Revalor builds and hosts",
    tagline: "Next.js on Vercel, built with Claude Code — more control, faster to build.",
    points: [
      "Revalor owns hosting, uptime and maintenance — only makes sense with a monthly retainer.",
      "More control over the build.",
    ],
    caveat: "Vercel's free Hobby plan is non-commercial only; client sites belong on a paid Pro team. Check current Vercel pricing before quoting.",
  },
];

export const buildPathLabel = (path: WebsiteBuild["path"]): string => BUILD_PATHS.find((p) => p.key === path)?.label ?? "";

/** Business pieces every site should have, in client-facing language. */
export const PIECE_LABELS: { key: keyof NonNullable<WebsiteBuild["pieces"]>; label: string; clientLabel: string }[] = [
  { key: "agreement", label: "Written agreement (ownership + what we maintain)", clientLabel: "a written agreement covering ownership and what we maintain" },
  { key: "privacyPolicy", label: "Privacy policy (required with any contact/lead form)", clientLabel: "a privacy policy" },
  { key: "analytics", label: "Analytics", clientLabel: "website analytics" },
  { key: "accessibility", label: "Basic accessibility", clientLabel: "accessibility basics" },
  { key: "mobileTested", label: "Mobile testing", clientLabel: "mobile testing across devices" },
];

export const HANDOFF_LABELS: { key: keyof NonNullable<WebsiteBuild["handoff"]>; label: string }[] = [
  { key: "domainRecorded", label: "Domain recorded (registrar + who owns it)" },
  { key: "hostingLogin", label: "Hosting login handed over" },
  { key: "dnsRecords", label: "DNS records documented" },
  { key: "accessList", label: "Access list — who can get in" },
];

/** Small progress read-out for the tab: how many pieces / handoff items are ticked. */
export function websiteBuildProgress(wb: WebsiteBuild | undefined) {
  const pieces = wb?.pieces ?? {};
  const handoff = wb?.handoff ?? {};
  const piecesDone = PIECE_LABELS.filter((p) => pieces[p.key]).length;
  const handoffDone = HANDOFF_LABELS.filter((h) => handoff[h.key]).length;
  return { piecesDone, piecesTotal: PIECE_LABELS.length, handoffDone, handoffTotal: HANDOFF_LABELS.length };
}

export interface WebsiteBuildSummary {
  approach: string;
  domain?: string;
  included: string[];
  maintenance?: string;
  timeline?: string;
  handoff?: string;
}

/** Builds the client-safe proposal section, or null when there's nothing to show
 * (no path chosen, or the operator hasn't ticked "Show in client proposal").
 * Never exposes effort hours or margin. */
export function websiteBuildSummary(wb: WebsiteBuild | undefined, catalog: Catalog): WebsiteBuildSummary | null {
  if (!wb || !wb.showInProposal || !wb.path) return null;
  const m = (n: number) => money(catalog.settings.currency, n);

  let approach: string;
  if (wb.path === "builder") {
    const tool = (wb.builderTool || "").trim();
    approach = tool
      ? `We'll build your website on ${tool}, in your own account, so you own it outright.`
      : "We'll build your website on a standard site builder, in your own account, so you own it outright.";
  } else {
    approach = "We'll design, build and host a custom website for your business.";
  }

  const domainName = (wb.domain || "").trim();
  const domain = wb.domainOwnedByClient
    ? domainName
      ? `Your domain ${domainName} stays registered in your name — you always own it.`
      : "Your domain stays registered in your name — you always own it."
    : undefined;

  const included = PIECE_LABELS.filter((p) => wb.pieces?.[p.key]).map((p) => p.clientLabel);

  const maintenance =
    wb.path === "custom" && wb.monthlyMaintenance && wb.monthlyMaintenance > 0
      ? `Revalor hosts and maintains the site for ${m(wb.monthlyMaintenance)}/month, keeping it online, updated and backed up.`
      : undefined;

  // Only the operator's explicit client-facing note; buildDays is internal effort and stays off the proposal.
  const timeline = (wb.timelineNotes || "").trim() || undefined;

  const handoffTicked = HANDOFF_LABELS.filter((h) => wb.handoff?.[h.key]).length;
  const handoff = handoffTicked > 0 ? "At handoff you get every login and record for the site and domain, documented in one place." : undefined;

  return { approach, domain, included, maintenance, timeline, handoff };
}
