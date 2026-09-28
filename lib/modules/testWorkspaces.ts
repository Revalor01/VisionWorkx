import type { SupabaseClient } from "@supabase/supabase-js";

// Workspaces the QA suite creates (vw_workspaces.is_test) exist for a few
// minutes during a run. Keep them out of admin stats and the directory
// revalor-admin reads. Tolerant: if the is_test column isn't there yet, the
// lookup errors and nothing is filtered (so pages never break on it).
export async function testWorkspaceIds(db: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await db.from("vw_workspaces").select("id").eq("is_test", true);
  if (error) return new Set();
  return new Set((data ?? []).map((w: { id: string }) => w.id));
}

/**
 * Accounts the QA suite creates (qa/lib/modules.ts): qa+<tag>@example.com.
 * Their workspaces are marked is_test and they never get onboarding emails
 * or trigger the admin signup alert.
 */
export function isQaEmail(email: string | null | undefined): boolean {
  return /^qa\+[a-z0-9]+@example\.com$/i.test(email ?? "");
}
