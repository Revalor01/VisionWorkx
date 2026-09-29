import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_CATALOG, DEFAULT_ECOSYSTEM } from "./defaults";
import type { Answers, Assessment, AssessmentSummary, Catalog, Ecosystem, Overrides } from "./types";

// Needs Analyzer tables (vw_na_*) in the MAIN VisionWorkx project. Untyped client,
// same trust level as createServiceClient -- server-only. The tables have RLS on
// and no policies, so every caller must check the operator (or the sync secret,
// or a share token) first.

export function naDb(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type SettingsKey = "catalog" | "ecosystem";

export async function loadSettings(db: SupabaseClient): Promise<{ catalog: Catalog; ecosystem: Ecosystem }> {
  const { data } = await db.from("vw_na_settings").select("key, value");
  const rows = Object.fromEntries((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
  return {
    catalog: (rows.catalog as Catalog) ?? DEFAULT_CATALOG,
    ecosystem: (rows.ecosystem as Ecosystem) ?? DEFAULT_ECOSYSTEM,
  };
}

export async function saveSetting(db: SupabaseClient, key: SettingsKey, value: unknown) {
  return db.from("vw_na_settings").upsert({ key, value, updated_at: new Date().toISOString() });
}

export const ASSESSMENT_COLUMNS = "id, local_id, status, answers, overrides, share_token, share_enabled, created_at, updated_at";

export interface AssessmentRow {
  id: string;
  local_id: string | null;
  status: string;
  answers: Answers;
  overrides: Overrides;
  share_token: string | null;
  share_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export function toAssessment(r: AssessmentRow): Assessment {
  return {
    id: r.id,
    localId: r.local_id,
    status: r.status,
    answers: r.answers ?? {},
    overrides: r.overrides ?? {},
    shareToken: r.share_token,
    shareEnabled: r.share_enabled,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function toSummary(r: AssessmentRow): AssessmentSummary {
  return {
    id: r.id,
    bizName: String(r.answers?.bizName || "Untitled business"),
    industry: String(r.answers?.industry || ""),
    status: r.status || "Draft",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    shareEnabled: r.share_enabled,
    fromOffline: !!r.local_id,
  };
}

export async function listAssessments(db: SupabaseClient): Promise<AssessmentSummary[]> {
  const { data } = await db
    .from("vw_na_assessments")
    .select(ASSESSMENT_COLUMNS)
    .is("deleted_at", null)
    .eq("is_test", false)
    .order("updated_at", { ascending: false })
    .limit(1000);
  return ((data ?? []) as AssessmentRow[]).map(toSummary);
}

export async function getAssessment(db: SupabaseClient, id: string): Promise<Assessment | null> {
  if (!UUID_RE.test(id)) return null;
  const { data } = await db.from("vw_na_assessments").select(ASSESSMENT_COLUMNS).eq("id", id).is("deleted_at", null).maybeSingle();
  return data ? toAssessment(data as AssessmentRow) : null;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Unguessable proposal link token (32 url-safe characters, 192 bits). */
export function newShareToken(): string {
  return randomBytes(24).toString("base64url");
}
export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
