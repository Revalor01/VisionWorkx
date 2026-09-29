import { LOGO_SLOTS, STATUSES, type Answers, type Catalog, type Ecosystem, type Overrides } from "./types";

// Input checks for the Needs Analyzer API. Answers and overrides are stored as
// JSON as the app produces them; these only make sure the shapes can't break the
// screens or the rules engine, and that nothing oversized gets in.

export const MAX_BODY_BYTES = 512 * 1024;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isArr = Array.isArray;

export async function readJson(req: Request, maxBytes = MAX_BODY_BYTES): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new Error("Too large");
  return JSON.parse(text);
}

export function isOverrides(o: unknown): o is Overrides {
  if (!isObject(o)) return false;
  if ((o.excluded !== undefined && !isArr(o.excluded)) || (o.added !== undefined && !isArr(o.added))) return false;
  if (o.custom !== undefined && !(isArr(o.custom) && o.custom.every((c) => isObject(c) && typeof c.id === "string"))) return false;
  return o.prices === undefined || isObject(o.prices);
}

export function parseAssessmentPatch(v: unknown): { status?: string; answers?: Answers; overrides?: Overrides } | null {
  if (!isObject(v)) return null;
  const out: { status?: string; answers?: Answers; overrides?: Overrides } = {};
  if (v.status !== undefined) {
    if (typeof v.status !== "string" || !(STATUSES as readonly string[]).includes(v.status)) return null;
    out.status = v.status;
  }
  if (v.answers !== undefined) {
    if (!isObject(v.answers)) return null;
    out.answers = v.answers as Answers;
  }
  if (v.overrides !== undefined) {
    if (!isOverrides(v.overrides)) return null;
    out.overrides = v.overrides;
  }
  return out;
}

export function isCatalog(v: unknown): v is Catalog {
  if (!isObject(v) || !isObject(v.company) || !isObject(v.settings) || !isObject(v.phases) || !isArr(v.modules)) return false;
  if (!v.modules.every((m) => isObject(m) && typeof m.id === "string" && typeof m.name === "string")) return false;
  const logos = v.settings.logos;
  if (logos !== undefined) {
    if (!isObject(logos)) return false;
    for (const [slot, url] of Object.entries(logos)) {
      // Any text is stored (so a half-typed address still saves); brand.ts logoUrl()
      // only ever renders https addresses.
      if (!(LOGO_SLOTS as readonly string[]).includes(slot) || typeof url !== "string" || url.length > 500) return false;
    }
  }
  return true;
}

export function isEcosystem(v: unknown): v is Ecosystem {
  if (!isObject(v) || !isArr(v.capabilities) || !isArr(v.tools)) return false;
  return (
    v.capabilities.every((c) => isObject(c) && typeof c.id === "string" && typeof c.name === "string") &&
    v.tools.every((t) => isObject(t) && typeof t.id === "string" && typeof t.name === "string")
  );
}
