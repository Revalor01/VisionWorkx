import { qaDb } from "./db";
import { GLOBAL_SLUG, isCadence, isProductCadence, type Cadence, type ProductCadence } from "./schedule";

// Server-only DB access for the QA schedule (service-role; vw_qa_schedule has
// RLS on and no policies). Kept out of schedule.ts so that module stays pure
// and importable from client components.

interface ScheduleRow {
  product_slug: string;
  cadence: ProductCadence;
}

/** The global default cadence plus every per-product override. */
export async function loadSchedule(): Promise<{ global: Cadence; overrides: Record<string, ProductCadence> }> {
  const db = qaDb();
  const { data } = await db.from("vw_qa_schedule").select("product_slug, cadence");
  let global: Cadence = "nightly";
  const overrides: Record<string, ProductCadence> = {};
  for (const r of (data ?? []) as ScheduleRow[]) {
    if (r.product_slug === GLOBAL_SLUG) {
      if (isCadence(r.cadence)) global = r.cadence;
    } else if (isProductCadence(r.cadence)) {
      overrides[r.product_slug] = r.cadence;
    }
  }
  return { global, overrides };
}
