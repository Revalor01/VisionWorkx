"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import AppNavbar from "@/components/nav/AppNavbar";
import { formatMetricValue, type Insights, type MetricSeries } from "@/lib/apps/insightsShared";
import type { Plan } from "@/lib/database.types";

function Sparkline({ series, days }: { series: MetricSeries; days: number }) {
  const w = 160;
  const h = 40;
  if (series.points.length === 0) return <div style={{ height: h }} />;

  // Bucket points onto a dense day axis so gaps read as zero.
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const byDay = new Map(series.points.map((p) => [p.day, p.value]));
  const values: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    values.push(byDay.get(d.toISOString().slice(0, 10)) ?? 0);
  }

  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const pts = values
    .map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 4) - 2).toFixed(1)}`)
    .join(" ");
  const last = values[values.length - 1];
  const lastY = h - (last / max) * (h - 4) - 2;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="mt-3 text-navy">
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={w} cy={lastY} r="2.5" fill="currentColor" />
    </svg>
  );
}

export default function InsightsClient({
  appId,
  appName,
  days,
  windows,
  insights,
  userName,
  userEmail,
  plan,
}: {
  appId: string;
  appName: string;
  days: number;
  windows: number[];
  insights: Insights;
  userName: string | null;
  userEmail: string | null;
  plan: Plan;
}) {
  const router = useRouter();

  return (
    <>
      <AppNavbar userName={userName} plan={plan} userEmail={userEmail} />
      <main className="mx-auto max-w-4xl px-4 py-10">
        <Link href="/dashboard" className="text-sm text-navy hover:underline">
          ← Back to Dashboard
        </Link>

        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-navy-dark">Insights</h1>
            <p className="text-gray-500 text-sm">{appName}</p>
          </div>
          <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1">
            {windows.map((w) => (
              <button
                key={w}
                onClick={() => router.push(`/apps/${appId}/insights?days=${w}`)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  w === days ? "bg-navy-dark text-white" : "text-gray-500 hover:text-navy-dark"
                }`}
              >
                {w}d
              </button>
            ))}
          </div>
        </div>

        {!insights.hasData ? (
          <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            No activity yet. Numbers show up here once your app starts recording bookings, leads,
            orders, payments — whatever it tracks.
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {insights.metrics.map((m) => (
                <div
                  key={m.key}
                  className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    {m.label}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-navy-dark tabular-nums">
                    {formatMetricValue(m.key, m.total)}
                  </p>
                  <p className="text-xs text-gray-400">last {days} days</p>
                  <Sparkline series={m} days={days} />
                </div>
              ))}
            </div>
            {insights.lastCaptured && (
              <p className="mt-6 text-xs text-gray-400">
                Updated {new Date(insights.lastCaptured).toLocaleString()}. Refreshes nightly.
              </p>
            )}
          </>
        )}
      </main>
    </>
  );
}
