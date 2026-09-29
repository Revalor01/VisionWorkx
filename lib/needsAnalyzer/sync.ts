import type { Answers, Overrides } from "./types";

// Offline -> online sync for the Needs Analyzer. The laptop app keeps its own
// files (data/assessments/<id>.json); scripts/needs-analyzer-sync.mjs posts them to
// /api/needs-analyzer/sync, which matches each one to a row by local_id and uses
// decideSync() to choose what happens. Pure, so it's unit-tested.

/** Same id rule as the offline app's server.js (safeId). */
export const LOCAL_ID_RE = /^[a-z0-9-]{6,64}$/i;
export const MAX_SYNC_ASSESSMENTS = 500;

export interface LocalAssessment {
  id: string;
  status: string;
  answers: Answers;
  overrides: Overrides;
  createdAt: string;
  updatedAt: string;
}

export interface OnlineSyncRow {
  id: string;
  updated_at: string;
  synced_at: string | null;
  deleted_at: string | null;
}

export type SyncAction =
  | "insert" // new on the laptop
  | "update" // changed on the laptop only
  | "unchanged" // nothing new on the laptop
  | "online-newer" // changed online only; the laptop copy is behind
  | "conflict" // changed in both places; online copy kept
  | "deleted-online"; // deleted online; stays deleted

const t = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

export function decideSync(local: LocalAssessment, online: OnlineSyncRow | undefined): SyncAction {
  if (!online) return "insert";
  if (online.deleted_at) return "deleted-online";
  const localAt = t(local.updatedAt);
  // Rows created online and later matched can't happen (local_id is only set by
  // sync), so synced_at is present; fall back to updated_at just in case.
  const syncedAt = Number.isFinite(t(online.synced_at)) ? t(online.synced_at) : t(online.updated_at);
  const localChanged = localAt > syncedAt;
  const onlineChanged = t(online.updated_at) > syncedAt;
  if (localChanged && onlineChanged) return "conflict";
  if (localChanged) return "update";
  if (onlineChanged) return "online-newer";
  return "unchanged";
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isIso = (v: unknown): v is string => typeof v === "string" && v.length <= 40 && Number.isFinite(Date.parse(v));

/** Validates one assessment file from the laptop; null when it isn't usable. */
export function parseLocalAssessment(v: unknown): LocalAssessment | null {
  if (!isObject(v)) return null;
  const { id, status, answers, overrides, createdAt, updatedAt } = v;
  if (typeof id !== "string" || !LOCAL_ID_RE.test(id)) return null;
  if (!isIso(updatedAt)) return null;
  if (answers !== undefined && !isObject(answers)) return null;
  if (overrides !== undefined && !isObject(overrides)) return null;
  return {
    id,
    status: typeof status === "string" && status.length <= 40 ? status : "Draft",
    answers: (answers ?? {}) as Answers,
    overrides: (overrides ?? {}) as Overrides,
    createdAt: isIso(createdAt) ? createdAt : updatedAt,
    updatedAt,
  };
}
