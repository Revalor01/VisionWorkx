"use client";

import { useCallback, useEffect, useState } from "react";
import type { SocialBrand } from "@/lib/database.types";
import { FacebookIcon, InstagramIcon, TikTokIcon, YouTubeIcon } from "./PlatformIcons";

interface PostRow {
  contentId: string;
  brandId: string;
  platform: string;
  postedAt: string | null;
  hook: string | null;
  caption: string;
  reach: number | null;
  impressions: number | null;
  engagementRate: number | null;
  trackedClicks: number | null;
  linkClicks: number | null;
}

interface PerfData {
  days: number;
  summary: {
    postCount: number;
    postsWithMetrics: number;
    totalReach: number;
    totalImpressions: number;
    totalTrackedClicks: number;
    totalNativeLinkClicks: number;
    avgEngagementRate: number | null;
  };
  byPlatform: {
    platform: string;
    postCount: number;
    totalReach: number;
    totalTrackedClicks: number;
    avgEngagementRate: number | null;
  }[];
  byHour: { hour: number; postCount: number; avgEngagementRate: number | null }[];
  topHooks: string[];
  posts: PostRow[];
}

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
const pct = (x: number | null | undefined) =>
  x == null ? "—" : `${(x * 100).toFixed(1)}%`;

function platformIcon(p: string) {
  if (p === "facebook") return <FacebookIcon />;
  if (p === "instagram") return <InstagramIcon uid={`perf-${p}`} />;
  if (p === "tiktok") return <TikTokIcon />;
  if (p === "youtube") return <YouTubeIcon />;
  return null;
}

export default function PerformanceTab({ brands }: { brands: SocialBrand[] }) {
  const [brandId, setBrandId] = useState<string>("");
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<PerfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "—";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ days: String(days) });
      if (brandId) qs.set("brandId", brandId);
      const res = await fetch(`/api/social/performance?${qs}`);
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [brandId, days]);

  useEffect(() => {
    load();
  }, [load]);

  const maxHourEng = Math.max(
    0.0001,
    ...(data?.byHour.map((h) => h.avgEngagementRate ?? 0) ?? [])
  );

  return (
    <div className="space-y-6">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={brandId}
          onChange={(e) => setBrandId(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                days === d ? "bg-[#1A3A5C] text-white" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
        {loading && <span className="text-sm text-slate-400">Loading…</span>}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {data && (
        <>
          {/* summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {[
              { label: "Posts", value: String(data.summary.postCount) },
              {
                label: "With metrics",
                value: `${data.summary.postsWithMetrics}/${data.summary.postCount}`,
              },
              { label: "Total reach", value: fmt(data.summary.totalReach) },
              { label: "Avg engagement", value: pct(data.summary.avgEngagementRate) },
              {
                label: "Link clicks (tracked)",
                value: fmt(data.summary.totalTrackedClicks),
              },
            ].map((c) => (
              <div
                key={c.label}
                className="bg-white border border-slate-200 rounded-xl px-4 py-3"
              >
                <div className="text-xs text-slate-400 font-medium">{c.label}</div>
                <div className="text-xl font-bold text-[#1A3A5C] mt-0.5">{c.value}</div>
              </div>
            ))}
          </div>

          {data.summary.postsWithMetrics === 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3">
              No measured posts yet in this window. Metrics start populating on the
              next <code>/api/cron/social-metrics</code> run (every 6h) and after
              new posts go out with tracked links.
            </div>
          )}

          {/* what's feeding the content engine */}
          {data.topHooks.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-[#1A3A5C] mb-2">
                What&apos;s feeding the content engine
              </h3>
              <p className="text-xs text-slate-400 mb-3">
                Top-performing hooks from this window — the generator uses these as
                &quot;make more like this&quot; examples.
              </p>
              <ul className="space-y-1.5">
                {data.topHooks.map((h, i) => (
                  <li key={i} className="text-sm text-slate-700 flex gap-2">
                    <span className="text-slate-300">{i + 1}.</span>
                    <span className="italic">&ldquo;{h}&rdquo;</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-4">
            {/* by platform */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-[#1A3A5C] mb-3">By platform</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-400 text-left">
                    <th className="font-medium pb-1">Platform</th>
                    <th className="font-medium pb-1 text-right">Posts</th>
                    <th className="font-medium pb-1 text-right">Reach</th>
                    <th className="font-medium pb-1 text-right">Eng.</th>
                    <th className="font-medium pb-1 text-right">Clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byPlatform.map((p) => (
                    <tr key={p.platform} className="border-t border-slate-100">
                      <td className="py-1.5 flex items-center gap-2 capitalize">
                        {platformIcon(p.platform)}
                        {p.platform}
                      </td>
                      <td className="py-1.5 text-right">{p.postCount}</td>
                      <td className="py-1.5 text-right">{fmt(p.totalReach)}</td>
                      <td className="py-1.5 text-right">{pct(p.avgEngagementRate)}</td>
                      <td className="py-1.5 text-right">{fmt(p.totalTrackedClicks)}</td>
                    </tr>
                  ))}
                  {data.byPlatform.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-3 text-center text-slate-400">
                        No posts.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* best posting hours */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-[#1A3A5C] mb-1">
                Engagement by hour posted
              </h3>
              <p className="text-xs text-slate-400 mb-3">UTC · bar = avg engagement rate</p>
              <div className="space-y-1">
                {data.byHour
                  .slice()
                  .sort((a, b) => a.hour - b.hour)
                  .map((h) => (
                    <div key={h.hour} className="flex items-center gap-2 text-xs">
                      <span className="w-10 text-right text-slate-400 tabular-nums">
                        {String(h.hour).padStart(2, "0")}:00
                      </span>
                      <div className="flex-1 bg-slate-100 rounded h-3 overflow-hidden">
                        <div
                          className="h-full bg-[#2E6DA4]"
                          style={{
                            width: `${((h.avgEngagementRate ?? 0) / maxHourEng) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="w-12 text-right text-slate-500 tabular-nums">
                        {pct(h.avgEngagementRate)}
                      </span>
                      <span className="w-8 text-right text-slate-300 tabular-nums">
                        {h.postCount}p
                      </span>
                    </div>
                  ))}
                {data.byHour.length === 0 && (
                  <p className="text-slate-400 text-sm py-2">No posted content yet.</p>
                )}
              </div>
            </div>
          </div>

          {/* ranked posts */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 overflow-x-auto">
            <h3 className="text-sm font-semibold text-[#1A3A5C] mb-3">
              Top posts {brandId ? "" : "(all brands)"}
            </h3>
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-xs text-slate-400 text-left">
                  <th className="font-medium pb-2 w-6">#</th>
                  {!brandId && <th className="font-medium pb-2">Brand</th>}
                  <th className="font-medium pb-2">Platform</th>
                  <th className="font-medium pb-2">Posted</th>
                  <th className="font-medium pb-2">Hook / caption</th>
                  <th className="font-medium pb-2 text-right">Reach</th>
                  <th className="font-medium pb-2 text-right">Eng.</th>
                  <th className="font-medium pb-2 text-right">Clicks</th>
                </tr>
              </thead>
              <tbody>
                {data.posts.map((p, i) => (
                  <tr key={p.contentId} className="border-t border-slate-100 align-top">
                    <td className="py-2 text-slate-300 tabular-nums">{i + 1}</td>
                    {!brandId && (
                      <td className="py-2 text-slate-600">{brandName(p.brandId)}</td>
                    )}
                    <td className="py-2">
                      <span className="inline-flex items-center gap-1.5 capitalize">
                        {platformIcon(p.platform)}
                        {p.platform}
                      </span>
                    </td>
                    <td className="py-2 text-slate-500 whitespace-nowrap">
                      {p.postedAt
                        ? new Date(p.postedAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })
                        : "—"}
                    </td>
                    <td className="py-2 text-slate-700 max-w-[320px]">
                      <span className="line-clamp-2">
                        {p.hook?.trim() || p.caption.slice(0, 140)}
                      </span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{fmt(p.reach)}</td>
                    <td className="py-2 text-right tabular-nums">{pct(p.engagementRate)}</td>
                    <td className="py-2 text-right tabular-nums">
                      {fmt(p.trackedClicks)}
                      {p.linkClicks != null && (
                        <span className="text-slate-300"> / {fmt(p.linkClicks)}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {data.posts.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-slate-400">
                      No posts in this window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {data.posts.some((p) => p.linkClicks != null) && (
              <p className="text-xs text-slate-400 mt-2">
                Clicks = our tracked <code>/go</code> clicks / native platform link
                clicks.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
