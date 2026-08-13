import { createServiceClient } from "@/lib/supabase";
import { runManagementQuery, CHOREBIT_REF, FEELFLOW_REF, MINDBIT_REF } from "@/lib/social/weeklyStats";
import type { MarketingProduct } from "@/lib/database.types";

const REMOTE_PROJECT_REF: Record<Exclude<MarketingProduct, "visionworkx">, string> = {
  chorebit: CHOREBIT_REF,
  feelflow: FEELFLOW_REF,
  mindbit: MINDBIT_REF,
};

export const PRODUCT_LABEL: Record<MarketingProduct, string> = {
  visionworkx: "VisionWorkx",
  chorebit: "Chorebit",
  feelflow: "FeelFlow",
  mindbit: "MindBit",
};

interface AudienceMember {
  id: string;
  email: string;
}

// VisionWorkx is the local project — read auth.users via the admin API
// vision-workx already holds a service-role key for. The other three are
// separate Supabase projects vision-workx has no service-role key for, so
// they go through the Management API's arbitrary-SQL endpoint instead
// (same technique lib/social/weeklyStats.ts uses for cross-project counts,
// and the same query app/admin/page.tsx already runs against auth.users
// for vision-workx's own project).
async function fetchProductUsers(product: MarketingProduct): Promise<AudienceMember[]> {
  if (product === "visionworkx") {
    const service = createServiceClient();
    let all: AudienceMember[] = [];
    let page = 1;
    while (true) {
      const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      all = all.concat(data.users.filter((u) => !!u.email).map((u) => ({ id: u.id, email: u.email! })));
      if (data.users.length < 200) break;
      page++;
    }
    return all;
  }

  const rows = await runManagementQuery(REMOTE_PROJECT_REF[product], "SELECT id, email FROM auth.users");
  return rows
    .filter((r): r is { id: string; email: string } => typeof r.email === "string" && !!r.email)
    .map((r) => ({ id: r.id as string, email: r.email as string }));
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
