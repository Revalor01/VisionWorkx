// Revalor Needs Analyzer, online copy. Shapes mirror the offline app's JSON files
// (revalor-needs-analyzer/data/*) so assessments sync between the two unchanged.

export type AnswerValue = string | number | string[] | undefined;
export type Answers = Record<string, AnswerValue>;

export interface CustomItem {
  id: string;
  name: string;
  description?: string;
  phase?: number;
  qty?: number;
  setup?: number;
  monthly?: number;
  effortHours?: number;
  hoursSavedPerWeek?: number;
  requires?: string[];
  reason?: string;
}

export interface PriceOverride {
  setup?: number;
  monthly?: number;
  qty?: number;
}

/** The build path chosen for the client's website. */
export type BuildPath = "builder" | "custom";

/** Online-only build runbook, kept per assessment in `overrides.websiteBuild`. It
 * never affects module scoring; it records how the client's website gets built and
 * feeds an optional client-safe section of the proposal. Stored as JSON, so the
 * offline laptop app carries it through sync unchanged. */
export interface WebsiteBuild {
  /** "" while undecided; a builder site in the client's account, or a Revalor-hosted custom build. */
  path?: BuildPath | "";
  /** Builder path: which platform (Squarespace / Wix / WordPress / Webflow, or free text). */
  builderTool?: string;
  // Domain
  domain?: string;
  registrar?: string;
  /** The domain must be registered in the client's name, never Revalor's. */
  domainOwnedByClient?: boolean;
  /** How Revalor gets in — invite or delegated DNS, never the client's password. */
  accessMethod?: string;
  /** The client already runs email on the domain, so the MX records must not be touched. */
  hasExistingEmail?: boolean;
  dnsDone?: boolean;
  // Business pieces every site should have
  pieces?: {
    agreement?: boolean;
    privacyPolicy?: boolean;
    analytics?: boolean;
    accessibility?: boolean;
    mobileTested?: boolean;
  };
  // Handoff checklist
  handoff?: {
    domainRecorded?: boolean;
    hostingLogin?: boolean;
    dnsRecords?: boolean;
    accessList?: boolean;
  };
  // Effort and commercials
  buildDays?: string;
  /** Monthly retainer for the custom (Revalor-hosted) path; also shown in the proposal. */
  monthlyMaintenance?: number;
  timelineNotes?: string;
  // Proposal
  showInProposal?: boolean;
  /** Optional operator text; when empty the proposal builds a summary from the fields above. */
  clientSummary?: string;
}

export interface Overrides {
  excluded?: string[];
  added?: string[];
  prices?: Record<string, PriceOverride>;
  custom?: CustomItem[];
  discountPct?: number;
  /** Combined founding-client discount applied to the recurring monthly on the proposal.
   * Presentation-layer only (read by the online proposal view), never by computePlan. */
  monthlyDiscountPct?: number;
  websiteBuild?: WebsiteBuild;
}

export const STATUSES = ["Draft", "Proposal sent", "Won", "Lost"] as const;

/** Which questionnaire + recommendation an assessment uses. Stored in `answers.path`
 * (free-form JSON, so no migration and it syncs to the laptop unchanged); a missing
 * value means the original "standard" path. */
export type AssessmentPath = "standard" | "apparel";

export interface Assessment {
  id: string;
  status: string;
  answers: Answers;
  overrides: Overrides;
  createdAt: string;
  updatedAt: string;
  shareEnabled: boolean;
  shareToken: string | null;
  localId: string | null;
}

export interface AssessmentSummary {
  id: string;
  bizName: string;
  industry: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  shareEnabled: boolean;
  fromOffline: boolean;
}

export const CATEGORIES = ["VisionWorkx", "Automation", "Revalor Product", "Custom Build", "Service", "Apparel"] as const;

export interface CatalogModule {
  id: string;
  name: string;
  category: string;
  phase: number;
  setup: number;
  monthly: number;
  effortHours: number;
  hoursSavedPerWeek: number;
  active?: boolean;
  description: string;
  requires?: string[];
}

export const LOGO_SLOTS = ["business", "consulting", "visionworkx", "automation", "proactive", "badge"] as const;
export type LogoSlot = (typeof LOGO_SLOTS)[number];

export interface Catalog {
  company: { name: string; tagline: string; consultant: string; email: string; website: string; badge: string };
  settings: {
    currency: string;
    clientHourValue: number;
    internalRate: number;
    closeRate: number;
    includeThreshold: number;
    proposalValidDays: number;
    discountPct: number;
    proposalDarkHeader?: boolean;
    /** Economics panel (operator-only): cost model behind margin / minimum price /
     * discount-guard. All optional; `computeEconomics` falls back to ECON_DEFAULTS. */
    targetMarginPct?: number;
    platformCostMonthly?: number;
    activeClientApps?: number;
    aiCostMonthly?: number;
    supportHoursMonthly?: number;
    stripePct?: number;
    stripeFixed?: number;
    /** Online only: image address per logo slot. Empty string hides that logo. */
    logos?: Partial<Record<LogoSlot, string>>;
  };
  phases: Record<string, { name: string; timing: string }>;
  modules: CatalogModule[];
}

export interface Capability {
  id: string;
  name: string;
  description: string;
}

export const TOOL_STATUSES = ["In use", "Planned", "To confirm", "Retired"] as const;

export interface EcoTool {
  id: string;
  name: string;
  type: string;
  status: string;
  usedBy?: string[];
  provides?: string[];
  notes?: string;
}

export interface Ecosystem {
  _readme?: string;
  capabilities: Capability[];
  tools: EcoTool[];
}

// ── Custom apparel / merch path ─────────────────────────────────────────────
// A second assessment path for decoration/merch businesses. It scores the apparel
// answers into one of three delivery tiers and prices each from the "Apparel"
// catalog modules (grouped by `phase` = tier). Kept separate from the standard
// module-scoring engine (computePlan); the apparel plan never runs the RULES.

export interface ApparelTierItem {
  id: string;
  name: string;
  description: string;
  setup: number;
  monthly: number;
}

export interface ApparelTier {
  /** 1 = Platform setup, 2 = Hybrid, 3 = Full custom. */
  tier: 1 | 2 | 3;
  name: string;
  blurb: string;
  items: ApparelTierItem[];
  setup: number;
  monthly: number;
  recommended: boolean;
}

export interface ApparelPlan {
  tiers: ApparelTier[];
  recommendedTier: 1 | 2 | 3;
  /** Plain-English reasons the recommended tier was chosen (client-safe). */
  reasons: string[];
  /** "What the client must provide" for the build to proceed (client-safe). */
  clientMustProvide: string[];
}
