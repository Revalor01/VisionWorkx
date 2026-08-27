import { createServiceClient } from "@/lib/supabase";
import { runManagementQuery } from "@/lib/social/weeklyStats";
import { getMarketingProduct } from "@/lib/marketing/products";
import type { MarketingProduct } from "@/lib/database.types";

// Cheap, real recent-activity signal for a recurring digest's prompt —
// new signups in the last 7 days, resolved the same local/remote way
// lib/marketing/audience.ts resolves the full audience. Not richer
// per-product activity (feature usage, top content) because nothing
// cheaper than a raw signup count is wired up cross-product yet.
// TODO: once a product exposes real usage/content signals the admin can
// cheaply read, fold them in here instead of falling back to just a count.
export async function buildDigestContext(product: MarketingProduct): Promise<string> {
  const { audienceSource } = getMarketingProduct(product);
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    const newUsers = await countNewUsers(audienceSource, since);
    return `Recent activity: ${newUsers} new signup${newUsers === 1 ? "" : "s"} in the last 7 days.`;
  } catch (err) {
    console.error(`[marketing/digestContext] failed for ${product}:`, err);
    return "";
  }
}

async function countNewUsers(
  audienceSource: ReturnType<typeof getMarketingProduct>["audienceSource"],
  since: string
): Promise<number> {
  if (audienceSource.kind === "local") {
    // auth.users isn't queryable through the normal client — page-walk
    // admin.listUsers() the same way audience.ts does for the local
    // project, since there's no SQL escape hatch for "this app's own"
    // Supabase project the way runManagementQuery gives remote ones.
    const service = createServiceClient();
    let count = 0;
    let page = 1;
    while (true) {
      const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      count += data.users.filter((u) => u.created_at >= since).length;
      if (data.users.length < 200) break;
      page++;
    }
    return count;
  }

  const rows = await runManagementQuery(
    audienceSource.projectRef,
    `select count(*) as count from auth.users where created_at >= '${since}'`
  );
  return Number(rows[0]?.count ?? 0);
}
