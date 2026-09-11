// Pure, framework-free versions of the calculations behind /admin's
// canary streak, build-outcome stats, and the bold Product Stability
// verdict. Extracted out of AdminDashboard.tsx's useMemo blocks so the
// exact same logic can run server-side too (app/api/admin/stability-analysis
// needs it to build Claude's input without duplicating — and drifting
// from — what the dashboard itself shows).

export type CanaryRunLite = {
  intake_key: string;
  status: string;
  failure_reason: string | null;
  duration_sec: number | null;
  created_at: string;
};

export type AppLite = {
  status: string;
  failure_reason: string | null;
  created_at: string;
};

export type CanaryStats = {
  rate7: number | null;
  rate30: number | null;
  avgMin: number | null;
  pending: number;
  byKey: Record<string, { pass: number; total: number }>;
  byKey7: Record<string, { pass: number; total: number }>;
  recent: CanaryRunLite[];
  total30: number;
  streak: number;
  longestStreak: number;
  gradedBatchCount: number;
  streakGoal: number;
};

const BATCH_GAP_MS = 5 * 60_000;

export function computeCanaryStats(canaryRuns: CanaryRunLite[]): CanaryStats {
  const now = Date.now();
  const graded = canaryRuns.filter((r) => r.status === "pass" || r.status === "fail");
  const rate = (days: number) => {
    const inWin = graded.filter((r) => now - new Date(r.created_at).getTime() < days * 86400000);
    if (inWin.length === 0) return null;
    return inWin.filter((r) => r.status === "pass").length / inWin.length;
  };
  const durations = graded
    .filter((r) => r.status === "pass" && r.duration_sec)
    .map((r) => r.duration_sec as number);
  const avgSec = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;
  const byKey: Record<string, { pass: number; total: number }> = {};
  for (const r of graded.filter((x) => now - new Date(x.created_at).getTime() < 30 * 86400000)) {
    byKey[r.intake_key] = byKey[r.intake_key] ?? { pass: 0, total: 0 };
    byKey[r.intake_key].total += 1;
    if (r.status === "pass") byKey[r.intake_key].pass += 1;
  }
  const byKeyWindow = (days: number) => {
    const out: Record<string, { pass: number; total: number }> = {};
    for (const r of graded.filter((x) => now - new Date(x.created_at).getTime() < days * 86400000)) {
      out[r.intake_key] = out[r.intake_key] ?? { pass: 0, total: 0 };
      out[r.intake_key].total += 1;
      if (r.status === "pass") out[r.intake_key].pass += 1;
    }
    return out;
  };
  const byTime = [...canaryRuns].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const batches: { at: string; rows: CanaryRunLite[] }[] = [];
  for (const r of byTime) {
    const last = batches[batches.length - 1];
    if (last && new Date(r.created_at).getTime() - new Date(last.at).getTime() <= BATCH_GAP_MS) {
      last.rows.push(r);
      last.at = r.created_at;
    } else {
      batches.push({ at: r.created_at, rows: [r] });
    }
  }
  const gradedBatches = batches
    .filter((b) => b.rows.every((r) => r.status === "pass" || r.status === "fail"))
    .map((b) => ({
      at: b.at,
      clean: b.rows.every((r) => r.status === "pass"),
      n: b.rows.length,
    }));
  let streak = 0;
  for (let i = gradedBatches.length - 1; i >= 0; i--) {
    if (gradedBatches[i].clean) streak += 1;
    else break;
  }
  let longestStreak = 0;
  let running = 0;
  for (const b of gradedBatches) {
    running = b.clean ? running + 1 : 0;
    longestStreak = Math.max(longestStreak, running);
  }

  return {
    rate7: rate(7),
    rate30: rate(30),
    avgMin: avgSec != null ? Math.round(avgSec / 60) : null,
    pending: canaryRuns.filter((r) => r.status === "pending").length,
    byKey,
    byKey7: byKeyWindow(7),
    recent: canaryRuns.slice(0, 12),
    total30: graded.filter((r) => now - new Date(r.created_at).getTime() < 30 * 86400000).length,
    streak,
    longestStreak,
    gradedBatchCount: gradedBatches.length,
    streakGoal: 10,
  };
}

export type OutcomeSummary = {
  total: number;
  deployed: number;
  failed: number;
  deployFailed: number;
  inProgress: number;
  terminal: number;
  pctComplete: number | null;
};

export type RankedReason = { reason: string; count: number; real: number; canary: number; pct: number };

export type BuildOutcomes = {
  all: OutcomeSummary;
  d30: OutcomeSummary;
  d7: OutcomeSummary;
  topReasons: RankedReason[];
  totalFailures: number;
  topReasonsAll: RankedReason[];
  totalFailuresAll: number;
};

export function computeBuildOutcomes(apps: AppLite[], canaryRuns: CanaryRunLite[]): BuildOutcomes {
  const now = Date.now();
  const windowed = (days: number | null) =>
    days == null ? apps : apps.filter((a) => now - new Date(a.created_at).getTime() < days * 86400000);
  const summarize = (rows: AppLite[]): OutcomeSummary => {
    const deployed = rows.filter((a) => a.status === "deployed").length;
    const failed = rows.filter((a) => a.status === "failed").length;
    const deployFailed = rows.filter((a) => a.status === "deploy_failed").length;
    const inProgress = rows.filter((a) =>
      ["generating", "ready", "deploying"].includes(a.status),
    ).length;
    const terminal = deployed + failed + deployFailed;
    return {
      total: rows.length,
      deployed,
      failed,
      deployFailed,
      inProgress,
      terminal,
      pctComplete: terminal > 0 ? deployed / terminal : null,
    };
  };
  const countReasons = (days: number | null) => {
    const cutoff = days == null ? null : now - days * 86400000;
    const inWindow = (iso: string) => cutoff == null || new Date(iso).getTime() >= cutoff;
    const reasonCounts = new Map<string, { count: number; real: number; canary: number }>();
    for (const a of apps) {
      if (a.status !== "failed" && a.status !== "deploy_failed") continue;
      if (!inWindow(a.created_at)) continue;
      const reason = a.failure_reason ?? "(unknown)";
      const e = reasonCounts.get(reason) ?? { count: 0, real: 0, canary: 0 };
      e.count += 1;
      e.real += 1;
      reasonCounts.set(reason, e);
    }
    for (const r of canaryRuns) {
      if (r.status !== "fail") continue;
      if (!inWindow(r.created_at)) continue;
      const reason = r.failure_reason ?? "(unknown)";
      const e = reasonCounts.get(reason) ?? { count: 0, real: 0, canary: 0 };
      e.count += 1;
      e.canary += 1;
      reasonCounts.set(reason, e);
    }
    const total = [...reasonCounts.values()].reduce((s, v) => s + v.count, 0);
    const ranked = [...reasonCounts.entries()]
      .map(([reason, v]) => ({ reason, ...v, pct: total > 0 ? v.count / total : 0 }))
      .sort((a, b) => b.count - a.count);
    return { ranked, total };
  };
  const reasons30 = countReasons(30);
  const reasonsAll = countReasons(null);
  return {
    all: summarize(windowed(null)),
    d30: summarize(windowed(30)),
    d7: summarize(windowed(7)),
    topReasons: reasons30.ranked,
    totalFailures: reasons30.total,
    topReasonsAll: reasonsAll.ranked,
    totalFailuresAll: reasonsAll.total,
  };
}

export type ProductStability = { stable: boolean; reasons: string[] };

export function computeProductStability(
  canaryStats: CanaryStats,
  buildOutcomes: BuildOutcomes,
): ProductStability {
  const reasons: string[] = [];
  if (canaryStats.gradedBatchCount === 0) {
    reasons.push("No canary runs graded yet");
  } else {
    if (canaryStats.streak < canaryStats.streakGoal) {
      reasons.push(
        `Canary streak ${canaryStats.streak}/${canaryStats.streakGoal} consecutive clean runs`,
      );
    }
    if (canaryStats.rate30 != null && canaryStats.rate30 < 0.9) {
      reasons.push(`30-day canary pass rate ${Math.round(canaryStats.rate30 * 100)}%`);
    }
  }
  if (
    buildOutcomes.d30.terminal >= 3 &&
    buildOutcomes.d30.pctComplete != null &&
    buildOutcomes.d30.pctComplete < 0.9
  ) {
    reasons.push(
      `Real-app 30-day completion rate ${Math.round(buildOutcomes.d30.pctComplete * 100)}% (${buildOutcomes.d30.deployed}/${buildOutcomes.d30.terminal})`,
    );
  }
  return { stable: reasons.length === 0, reasons };
}

// ── The 3-band traffic light for the Stability screen ──────────────────
// Distinct from `stable`/`reasons` above (which gate on the streak +
// canary rate + real-app rate together, all-or-nothing). This is a
// single continuous number — the real-app 30-day completion rate — so
// the Stability screen can show "how close", not just pass/fail.
// Thresholds as specified 2026-09-11: >=85% green, 70-84% amber (the
// 75-84 gap wasn't stated explicitly; treated as amber, the natural
// reading of a 3-band system with no stated fourth band), <70% red.
export type StabilityBand = "green" | "amber" | "red";

export function stabilityBand(pctComplete: number): StabilityBand {
  if (pctComplete >= 0.85) return "green";
  if (pctComplete >= 0.7) return "amber";
  return "red";
}
