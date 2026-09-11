import { describe, expect, it } from "vitest";
import {
  computeBuildOutcomes,
  computeCanaryStats,
  computeProductStability,
  stabilityBand,
  type AppLite,
  type CanaryRunLite,
} from "./productStability";

function minutesAgo(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString();
}
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function cleanBatches(n: number, startMinAgo: number): CanaryRunLite[] {
  return Array.from({ length: n }, (_, i) => ({
    intake_key: "booking",
    status: "pass",
    failure_reason: null,
    duration_sec: 600,
    created_at: minutesAgo(startMinAgo + (n - 1 - i) * 6),
  }));
}

describe("computeCanaryStats — streak", () => {
  it("counts a clean run of batches as a streak", () => {
    const stats = computeCanaryStats(cleanBatches(10, 0));
    expect(stats.streak).toBe(10);
    expect(stats.gradedBatchCount).toBe(10);
  });

  it("resets the streak to 0 on the most recent batch being red, even after a long clean run", () => {
    const rows: CanaryRunLite[] = [
      ...cleanBatches(10, 30),
      { intake_key: "booking", status: "fail", failure_reason: "boom", duration_sec: null, created_at: minutesAgo(10) },
    ];
    const stats = computeCanaryStats(rows);
    expect(stats.streak).toBe(0);
    expect(stats.longestStreak).toBe(10);
  });

  it("a pending row does not break or complete a batch — it's simply not graded", () => {
    const rows: CanaryRunLite[] = [
      ...cleanBatches(5, 20),
      { intake_key: "portal", status: "pending", failure_reason: null, duration_sec: null, created_at: minutesAgo(1) },
    ];
    const stats = computeCanaryStats(rows);
    expect(stats.pending).toBe(1);
    expect(stats.gradedBatchCount).toBe(5); // the pending batch isn't counted yet
  });
});

describe("computeBuildOutcomes", () => {
  it("computes % complete only over terminal builds, ignoring in-progress ones", () => {
    const apps: AppLite[] = [
      { status: "deployed", failure_reason: null, created_at: daysAgo(5) },
      { status: "deployed", failure_reason: null, created_at: daysAgo(4) },
      { status: "failed", failure_reason: "timeout", created_at: daysAgo(3) },
      { status: "generating", failure_reason: null, created_at: daysAgo(1) },
    ];
    const outcomes = computeBuildOutcomes(apps, []);
    expect(outcomes.d30.terminal).toBe(3);
    expect(outcomes.d30.inProgress).toBe(1);
    expect(outcomes.d30.pctComplete).toBeCloseTo(2 / 3);
  });

  it("ranks failure reasons across both real apps and canary runs, tagging the source", () => {
    const apps: AppLite[] = [
      { status: "failed", failure_reason: "quota exceeded", created_at: daysAgo(2) },
      { status: "failed", failure_reason: "quota exceeded", created_at: daysAgo(1) },
    ];
    const canaryRuns: CanaryRunLite[] = [
      { intake_key: "portal", status: "fail", failure_reason: "quota exceeded", duration_sec: null, created_at: daysAgo(1) },
    ];
    const outcomes = computeBuildOutcomes(apps, canaryRuns);
    const top = outcomes.topReasons[0];
    expect(top.reason).toBe("quota exceeded");
    expect(top.real).toBe(2);
    expect(top.canary).toBe(1);
  });
});

describe("computeProductStability", () => {
  it("is stable with a full streak, a healthy canary rate, and no real-app volume yet", () => {
    const canaryStats = computeCanaryStats(cleanBatches(10, 0));
    const buildOutcomes = computeBuildOutcomes([], []);
    expect(computeProductStability(canaryStats, buildOutcomes)).toEqual({ stable: true, reasons: [] });
  });

  it("flags a real-app completion rate under 90% once there's enough volume (>=3 terminal)", () => {
    const canaryStats = computeCanaryStats(cleanBatches(10, 0));
    const apps: AppLite[] = [
      { status: "deployed", failure_reason: null, created_at: daysAgo(5) },
      { status: "failed", failure_reason: null, created_at: daysAgo(4) },
      { status: "failed", failure_reason: null, created_at: daysAgo(3) },
    ];
    const buildOutcomes = computeBuildOutcomes(apps, []);
    const result = computeProductStability(canaryStats, buildOutcomes);
    expect(result.stable).toBe(false);
    expect(result.reasons.some((r) => r.startsWith("Real-app 30-day completion rate"))).toBe(true);
  });
});

describe("stabilityBand", () => {
  it("is green at and above 85%", () => {
    expect(stabilityBand(0.85)).toBe("green");
    expect(stabilityBand(1.0)).toBe("green");
  });
  it("is amber from 70% up to (not including) 85%", () => {
    expect(stabilityBand(0.7)).toBe("amber");
    expect(stabilityBand(0.74)).toBe("amber");
    expect(stabilityBand(0.84)).toBe("amber");
  });
  it("is red below 70%", () => {
    expect(stabilityBand(0.69)).toBe("red");
    expect(stabilityBand(0)).toBe("red");
  });
});
