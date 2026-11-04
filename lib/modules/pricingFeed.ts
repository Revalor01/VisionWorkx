import { PLAN_LIMITS, PLAN_PRICE, PLANS, type ModulePlan, type PlanLimits } from "./plans";
import { priceIdFor, stripe, type Interval } from "./billing";

// Displayed prices come from revalor-admin's /pricing feed (the editable
// source of truth), falling back to PLAN_PRICE. Checkout still charges the
// Stripe price in STRIPE_*_PRICE_ID, so a guard compares the two: if they
// disagree we show what Stripe will actually charge and log a warning.
// Plan limits stay in code (they gate real usage); the feed's limit note is
// only compared against them and any drift is logged.

export const DEFAULT_PRICING_FEED_URL = "https://revalor-admin.vercel.app/api/public/pricing/visionworkx";
const FEED_REVALIDATE_SECONDS = 300;
const FEED_TIMEOUT_MS = 3000;
const STRIPE_TTL_MS = 60 * 60 * 1000;

export interface PlanPrice {
  monthly: number;
  annual: number;
  label: string;
}
export type PlanPrices = Record<ModulePlan, PlanPrice>;

interface FeedTier {
  name?: unknown;
  monthly?: unknown;
  annual?: unknown;
  note?: unknown;
}

export interface ParsedFeed {
  prices: PlanPrices;
  notes: Partial<Record<ModulePlan, string>>;
}

/** Whole dollars, 1–100,000: anything else in the feed is treated as broken. */
const validAmount = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0 && n <= 100_000;

/** Parse the feed's JSON body. Returns null unless all three tiers have valid prices. */
export function parseFeed(body: unknown): ParsedFeed | null {
  const tiers = (body as { product?: { tiers?: unknown } } | null)?.product?.tiers;
  if (!Array.isArray(tiers)) return null;
  const prices = {} as PlanPrices;
  const notes: ParsedFeed["notes"] = {};
  for (const plan of PLANS) {
    const tier = (tiers as FeedTier[]).find((t) => typeof t?.name === "string" && t.name.trim().toLowerCase() === plan);
    if (!tier || !validAmount(tier.monthly) || !validAmount(tier.annual)) return null;
    prices[plan] = { monthly: tier.monthly, annual: tier.annual, label: PLAN_PRICE[plan].label };
    if (typeof tier.note === "string") notes[plan] = tier.note;
  }
  return { prices, notes };
}

export type StripeAmounts = Partial<Record<`${ModulePlan}:${Interval}`, number>>;

/** Pure: apply the Stripe guard. Stripe wins wherever it is known and differs. */
export function resolvePrices(base: PlanPrices, stripeAmounts: StripeAmounts): { prices: PlanPrices; mismatches: string[] } {
  const prices = {} as PlanPrices;
  const mismatches: string[] = [];
  for (const plan of PLANS) {
    const p = { ...base[plan] };
    for (const interval of ["monthly", "annual"] as const) {
      const charged = stripeAmounts[`${plan}:${interval}`];
      if (charged !== undefined && charged !== p[interval]) {
        mismatches.push(`${plan} ${interval}: shown $${p[interval]}, Stripe charges $${charged}`);
        p[interval] = charged;
      }
    }
    prices[plan] = p;
  }
  return { prices, mismatches };
}

/** Pure: compare the feed's limit note ("3 modules, 500 submissions, …") with PLAN_LIMITS. */
export function limitDrift(plan: ModulePlan, note: string, limits: PlanLimits = PLAN_LIMITS[plan]): string[] {
  const checks: [RegExp, keyof PlanLimits][] = [
    [/([\d,]+)\s+modules?/i, "modules"],
    [/([\d,]+)\s+submissions?/i, "submissionsPerMonth"],
    [/([\d,]+)\s+emails?/i, "emailsPerMonth"],
    [/([\d,]+)\s+AI chats?/i, "chatsPerMonth"],
    [/([\d,]+)\s+AI phone min/i, "voiceMinutesPerMonth"],
  ];
  const drift: string[] = [];
  for (const [re, key] of checks) {
    const m = note.match(re);
    if (!m) continue;
    const n = Number(m[1].replace(/,/g, ""));
    if (n !== limits[key]) drift.push(`${plan} ${key}: feed says ${n}, code enforces ${limits[key]}`);
  }
  return drift;
}

async function fetchFeed(): Promise<ParsedFeed | null> {
  try {
    const res = await fetch(process.env.PRICING_FEED_URL || DEFAULT_PRICING_FEED_URL, {
      next: { revalidate: FEED_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return parseFeed(await res.json());
  } catch {
    return null;
  }
}

let stripeCache: { at: number; ttl: number; amounts: StripeAmounts } | null = null;
const STRIPE_RETRY_MS = 5 * 60 * 1000; // after a failed lookup, try again sooner

async function fetchStripeAmounts(): Promise<StripeAmounts> {
  if (stripeCache && Date.now() - stripeCache.at < stripeCache.ttl) return stripeCache.amounts;
  if (!process.env.STRIPE_SECRET_KEY) return {};
  const amounts: StripeAmounts = {};
  let failed = false;
  const client = stripe();
  await Promise.all(
    PLANS.flatMap((plan) =>
      (["monthly", "annual"] as const).map(async (interval) => {
        const id = priceIdFor(plan, interval);
        if (!id) return;
        try {
          const price = await client.prices.retrieve(id);
          if (price.currency === "usd" && typeof price.unit_amount === "number") amounts[`${plan}:${interval}`] = price.unit_amount / 100;
          else console.warn(`[pricing] guard skipped for ${plan} ${interval}: Stripe price is not a fixed USD amount`);
        } catch {
          failed = true;
          console.warn(`[pricing] guard skipped for ${plan} ${interval}: Stripe price lookup failed`);
        }
      }),
    ),
  );
  stripeCache = { at: Date.now(), ttl: failed ? STRIPE_RETRY_MS : STRIPE_TTL_MS, amounts };
  return amounts;
}

/** Prices to display: feed → fallback to code → corrected to what Stripe charges. Never throws. */
export async function loadDisplayPrices(): Promise<{ prices: PlanPrices; source: "feed" | "code"; mismatches: string[] }> {
  const [feed, stripeAmounts] = await Promise.all([fetchFeed(), fetchStripeAmounts().catch(() => ({}) as StripeAmounts)]);
  const base = feed?.prices ?? PLAN_PRICE;
  const { prices, mismatches } = resolvePrices(base, stripeAmounts);
  const drift = feed ? PLANS.flatMap((p) => (feed.notes[p] ? limitDrift(p, feed.notes[p]!) : [])) : [];
  if (mismatches.length) console.warn("[pricing] feed/Stripe price mismatch — showing Stripe amount:", mismatches.join("; "));
  if (drift.length) console.warn("[pricing] feed limit note differs from enforced limits:", drift.join("; "));
  if (!feed) console.warn("[pricing] feed unavailable — using built-in prices");
  return { prices, source: feed ? "feed" : "code", mismatches };
}
