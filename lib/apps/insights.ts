// Phase 3: Insights — data access. Every generated app defines a
// `vw_metrics_daily` view in its own tenant schema (shape: day date,
// metric_key text, value numeric). The nightly cron snapshots each app's
// view into the platform-side app_metrics table; the dashboard reads from
// there. Presentation + types live in lib/apps/insightsShared (client-safe)
// and are re-exported below.

import { createServiceClient, createTenantServiceClient } from "@/lib/supabase";
import type { AppCategory } from "@/lib/database.types";
import {
  CATEGORY_HEADLINE_METRICS,
  METRIC_LABELS,
  type DailyPoint,
  type Insights,
  type MetricSeries,
} from "@/lib/apps/insightsShared";

export {
  CATEGORY_HEADLINE_METRICS,
  METRIC_LABELS,
  formatMetricValue,
} from "@/lib/apps/insightsShared";
export type { DailyPoint, Insights, MetricSeries } from "@/lib/apps/insightsShared";

const tenantSchema = (appId: string) => `app_${appId.slice(0, 8)}`;

interface TenantMetricRow {
  day: string;
  metric_key: string;
  value: number;
}

/**
 * Read an app's own `vw_metrics_daily` view. Returns [] for apps generated
 * before the reporting contract (no such view) and on any read error —
 * Insights degrades to "no data yet", never an error page.
 */
export async function readTenantMetrics(appId: string): Promise<TenantMetricRow[]> {
  try {
    const tc = createTenantServiceClient(tenantSchema(appId));
    const { data, error } = await tc
      .from("vw_metrics_daily")
      .select("day, metric_key, value");
    if (error || !data) return [];
    return (data as Record<string, unknown>[])
      .map((r) => ({
        day: String(r.day ?? "").slice(0, 10),
        metric_key: String(r.metric_key ?? ""),
        value: Number(r.value) || 0,
      }))
      .filter((r) => r.day.length === 10 && r.metric_key !== "");
  } catch {
    return [];
  }
}

/** Snapshot one app's view into app_metrics. Returns rows written. */
export async function rollupApp(appId: string, userId: string): Promise<number> {
  const rows = await readTenantMetrics(appId);
  if (rows.length === 0) return 0;

  const capturedAt = new Date().toISOString();
  const payload = rows.slice(0, 5000).map((r) => ({
    app_id: appId,
    user_id: userId,
    day: r.day,
    metric_key: r.metric_key,
    value: r.value,
    captured_at: capturedAt,
  }));

  const { error } = await createServiceClient()
    .from("app_metrics")
    .upsert(payload, { onConflict: "app_id,day,metric_key" });
  if (error) {
    console.error("[insights] rollup upsert failed:", error.message);
    return 0;
  }
  return payload.length;
}

/** Shape app_metrics for the dashboard over the last `days`. */
export async function getInsights(
  appId: string,
  category: AppCategory,
  days: number,
): Promise<Insights> {
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  const { data } = await createServiceClient()
    .from("app_metrics")
    .select("day, metric_key, value, captured_at")
    .eq("app_id", appId)
    .gte("day", since)
    .order("day", { ascending: true });

  const byKey = new Map<string, DailyPoint[]>();
  let lastCaptured: string | null = null;
  for (const r of data ?? []) {
    const list = byKey.get(r.metric_key) ?? [];
    list.push({ day: r.day, value: Number(r.value) || 0 });
    byKey.set(r.metric_key, list);
    if (!lastCaptured || r.captured_at > lastCaptured) lastCaptured = r.captured_at;
  }

  const order = [...CATEGORY_HEADLINE_METRICS[category]];
  for (const k of byKey.keys()) if (!order.includes(k)) order.push(k);

  const metrics: MetricSeries[] = order
    .filter((k) => byKey.has(k))
    .map((k) => {
      const points = byKey.get(k)!;
      return {
        key: k,
        label: METRIC_LABELS[k] ?? k,
        total: points.reduce((s, p) => s + p.value, 0),
        points,
      };
    });

  return { metrics, hasData: metrics.length > 0, lastCaptured };
}
