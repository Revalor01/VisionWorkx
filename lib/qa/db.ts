import { createClient } from "@supabase/supabase-js";

// QA suite tables (vw_qa_*) in the MAIN VisionWorkx project. Untyped client,
// same trust level as createServiceClient -- server-only (admin pages and the
// runner-facing report route). The tables have RLS on and no policies.

export const QA_BUCKET = "vw-qa-artifacts";

export function qaDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type RunStatus = "queued" | "running" | "passed" | "failed" | "error" | "cancelled";
export type ResultStatus = "passed" | "failed" | "skipped" | "timed_out" | "flaky";
export type Selection = "smoke" | "all" | "custom" | "nightly";

export interface QaProduct {
  slug: string;
  name: string;
  base_url: string;
  enabled: boolean;
}

export interface QaTest {
  id: string;
  product_slug: string;
  area: string;
  title: string;
  tags: string[];
  requires: string[];
  manual: boolean;
  active: boolean;
}

export interface QaRun {
  id: string;
  product_slug: string;
  target_env: "production" | "preview";
  target_url: string;
  selection: Selection;
  test_ids: string[];
  status: RunStatus;
  started_by: string | null;
  github_run_url: string | null;
  passed: number;
  failed: number;
  skipped: number;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface QaResult {
  id: string;
  run_id: string;
  test_id: string;
  status: ResultStatus;
  attempt: number;
  duration_ms: number | null;
  error_message: string | null;
  error_step: string | null;
  screenshot_path: string | null;
  trace_path: string | null;
  video_path: string | null;
  created_at: string;
}
