import { createServiceClient } from "@/lib/supabase";

// Known project refs for Revalor's other Supabase-backed apps — each is a
// fully separate Supabase project (its own auth pool, its own database),
// so cross-product stats have to go through the Management API's SQL
// endpoint rather than a local Supabase client. Same technique the Ops
// Dashboard already uses for storage-size aggregation.
const CHOREBIT_REF = "kkpwgnmhtcidnrnlwcll";
const FEELFLOW_REF = "duiyxiransdeqokwldqy";
const MINDBIT_REF = "uftlgnmvjjmuedotrewz";

async function runManagementQuery(projectRef: string, sql: string): Promise<Record<string, unknown>[]> {
  const token = process.env.SUPABASE_MANAGEMENT_TOKEN;
  if (!token) throw new Error("SUPABASE_MANAGEMENT_TOKEN is not configured");

  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`Management query failed for ${projectRef}: HTTP ${res.status}`);
  return res.json();
}

async function countSince(projectRef: string, table: string, column: string, since: string): Promise<number> {
  const rows = await runManagementQuery(
    projectRef,
    `select count(*) as count from ${table} where ${column} >= '${since}';`
  );
  return Number(rows[0]?.count ?? 0);
}

export interface WeeklyStats {
  weekStart: string;
  visionworkx: { newUsers: number; blogPostsPublished: number; socialPostsPublished: number };
  chorebit: { newFamilies: number; newKids: number; choresCompleted: number };
  feelflow: { newFamilies: number; newKids: number; checkins: number };
  mindbit: { newFamilies: number; newKids: number; gameSessions: number };
}

export async function computeWeeklyStats(): Promise<WeeklyStats> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const since = weekAgo.toISOString();

  const service = createServiceClient();

  const [
    { count: newUsers },
    { count: blogPostsPublished },
    { count: socialPostsPublished },
  ] = await Promise.all([
    service.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", since),
    service.from("blog_posts").select("id", { count: "exact", head: true }).eq("status", "published").gte("published_at", since),
    service.from("social_content").select("id", { count: "exact", head: true }).eq("status", "posted").gte("posted_at", since),
  ]);

  const [chorebitFamilies, chorebitKids, chorebitChores, feelflowFamilies, feelflowKids, feelflowCheckins, mindbitFamilies, mindbitKids, mindbitSessions] =
    await Promise.all([
      countSince(CHOREBIT_REF, "profiles", "created_at", since),
      countSince(CHOREBIT_REF, "kids", "created_at", since),
      countSince(CHOREBIT_REF, "chore_assignments", "created_at", since),
      countSince(FEELFLOW_REF, "profiles", "created_at", since),
      countSince(FEELFLOW_REF, "kids", "created_at", since),
      countSince(FEELFLOW_REF, "mood_checkins", "created_at", since),
      countSince(MINDBIT_REF, "profiles", "created_at", since),
      countSince(MINDBIT_REF, "kids", "created_at", since),
      countSince(MINDBIT_REF, "game_sessions", "created_at", since),
    ]);

  return {
    weekStart: weekAgo.toISOString().slice(0, 10),
    visionworkx: {
      newUsers: newUsers ?? 0,
      blogPostsPublished: blogPostsPublished ?? 0,
      socialPostsPublished: socialPostsPublished ?? 0,
    },
    chorebit: { newFamilies: chorebitFamilies, newKids: chorebitKids, choresCompleted: chorebitChores },
    feelflow: { newFamilies: feelflowFamilies, newKids: feelflowKids, checkins: feelflowCheckins },
    mindbit: { newFamilies: mindbitFamilies, newKids: mindbitKids, gameSessions: mindbitSessions },
  };
}
