import { createServiceClient } from "@/lib/supabase";
import { runManagementQuery } from "@/lib/social/weeklyStats";
import { getMarketingProduct, PRODUCT_LABEL } from "@/lib/marketing/products";
import type { MarketingProduct } from "@/lib/database.types";

export { PRODUCT_LABEL };

interface AudienceMember {
  id: string;
  email: string;
}

export interface AudienceMemberWithActivity extends AudienceMember {
  createdAt: string;
  lastSignInAt: string | null;
}

// VisionWorkx is the local project — read auth.users via the admin API
// vision-workx already holds a service-role key for. The other three are
// separate Supabase projects vision-workx has no service-role key for, so
// they go through the Management API's arbitrary-SQL endpoint instead
// (same technique lib/social/weeklyStats.ts uses for cross-project counts,
// and the same query app/admin/page.tsx already runs against auth.users
// for vision-workx's own project).
//
// Fetches created_at/last_sign_in_at too (not just id/email) — these are
// standard Supabase Auth columns present on every product's auth.users
// regardless of that product's own schema, which is what makes them usable
// as a product-agnostic activity signal for lib/lifecycle's triggers (see
// that module's comment on why this, not product-specific event data, is
// what the lifecycle trigger engine evaluates against today).
export async function fetchProductUsersWithActivity(product: MarketingProduct): Promise<AudienceMemberWithActivity[]> {
  const { audienceSource } = getMarketingProduct(product);

  if (audienceSource.kind === "local") {
    const service = createServiceClient();
    let all: AudienceMemberWithActivity[] = [];
    let page = 1;
    while (true) {
      const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      all = all.concat(
        data.users
          .filter((u) => !!u.email)
          .map((u) => ({ id: u.id, email: u.email!, createdAt: u.created_at, lastSignInAt: u.last_sign_in_at ?? null }))
      );
      if (data.users.length < 200) break;
      page++;
    }
    return all;
  }

  const rows = await runManagementQuery(audienceSource.projectRef, "SELECT id, email, created_at, last_sign_in_at FROM auth.users");
  return rows
    .filter((r): r is { id: string; email: string; created_at: string; last_sign_in_at: string | null } => typeof r.email === "string" && !!r.email)
    .map((r) => ({ id: r.id, email: r.email, createdAt: r.created_at, lastSignInAt: r.last_sign_in_at ?? null }));
}

async function fetchProductUsers(product: MarketingProduct): Promise<AudienceMember[]> {
  const withActivity = await fetchProductUsersWithActivity(product);
  return withActivity.map((u) => ({ id: u.id, email: u.email }));
}

async function getUnsubscribedEmails(product: MarketingProduct): Promise<Set<string>> {
  const service = createServiceClient();
  const { data, error } = await service.from("marketing_unsubscribes").select("email").eq("product", product);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.email.toLowerCase().trim()));
}

export async function getAudienceCount(product: MarketingProduct): Promise<number> {
  const [users, unsubscribed] = await Promise.all([fetchProductUsers(product), getUnsubscribedEmails(product)]);
  return users.filter((u) => !unsubscribed.has(u.email.toLowerCase().trim())).length;
}

export async function getSendableAudience(product: MarketingProduct): Promise<AudienceMember[]> {
  const [users, unsubscribed] = await Promise.all([fetchProductUsers(product), getUnsubscribedEmails(product)]);
  return users.filter((u) => !unsubscribed.has(u.email.toLowerCase().trim()));
}

// For targeted sends to a specific list of emails (not the full product
// audience) — still respects that product's unsubscribes, but doesn't
// require fetching the whole user list first.
export async function filterUnsubscribed(product: MarketingProduct, emails: string[]): Promise<string[]> {
  const unsubscribed = await getUnsubscribedEmails(product);
  return emails.filter((e) => !unsubscribed.has(e.toLowerCase().trim()));
}
