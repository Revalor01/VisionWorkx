"use client";

import { useMemo, useState } from "react";
import type { SocialBrand, SocialContent } from "@/lib/database.types";

// video_jobs belongs to the separate revalor-video repo and isn't in this
// repo's generated Database types (see page.tsx) - defined by hand here to
// match revalor-video's src/types.ts / migrations 003-004.
export interface VideoJobCalendarRow {
  id: string;
  topic: string;
  product: string;
  status: "queued" | "running" | "done" | "failed" | "approved" | "rejected";
  created_at: string;
  completed_at: string | null;
  published_at: string | null;
  youtube_url: string | null;
}

export interface BlogPostCalendarRow {
  id: string;
  product: string;
  title: string;
  status: "draft" | "published";
  auto_published: boolean;
  created_at: string;
  published_at: string | null;
}

export interface CampaignCalendarRow {
  id: string;
  product: string;
  channel: "email" | "push" | "sms";
  subject: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  run_at: string | null;
}

type ActivityKind = "social" | "video" | "blog" | "campaign";

interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  date: Date;
  title: string;
  subtitle: string;
  status: string;
  href: string | null;
}

const KIND_LABEL: Record<ActivityKind, string> = {
  social: "Social",
  video: "Video",
  blog: "SEO",
  campaign: "Campaign",
};

const KIND_DOT: Record<ActivityKind, string> = {
  social: "bg-sky-400",
  video: "bg-violet-400",
  blog: "bg-green-400",
  campaign: "bg-amber-400",
};

const KIND_BADGE: Record<ActivityKind, string> = {
  social: "bg-sky-100 text-sky-700",
  video: "bg-violet-100 text-violet-700",
  blog: "bg-green-100 text-green-700",
  campaign: "bg-amber-100 text-amber-700",
};

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// new Date("YYYY-MM-DD") parses as UTC midnight, which can render as the
// previous day in timezones behind UTC - build the Date from local parts.
function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export default function CalendarTab({
  brands,
  content,
  blogPosts,
  campaigns,
  videoJobs,
}: {
  brands: SocialBrand[];
  content: SocialContent[];
  blogPosts: BlogPostCalendarRow[];
  campaigns: CampaignCalendarRow[];
  videoJobs: VideoJobCalendarRow[];
}) {
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [activeKinds, setActiveKinds] = useState<Set<ActivityKind>>(
    () => new Set<ActivityKind>(["social", "video", "blog", "campaign"])
  );

  function toggleKind(k: ActivityKind) {
    setActiveKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function brandName(id: string) {
    return brands.find((b) => b.id === id)?.name ?? "—";
  }

  const events = useMemo<ActivityEvent[]>(() => {
    const out: ActivityEvent[] = [];

    for (const c of content) {
      const dateStr = c.scheduled_at ?? c.posted_at ?? c.created_at;
      if (!dateStr) continue;
      out.push({
        id: `social-${c.id}`,
        kind: "social",
        date: new Date(dateStr),
        title: truncate(c.hook || c.caption, 60),
        subtitle: `${brandName(c.brand_id)} · ${c.platform}`,
        status: c.status,
        href: null,
      });
    }

    for (const v of videoJobs) {
      const dateStr = v.published_at ?? v.completed_at ?? v.created_at;
      if (!dateStr) continue;
      out.push({
        id: `video-${v.id}`,
        kind: "video",
        date: new Date(dateStr),
        title: truncate(v.topic, 60),
        subtitle: `Video · ${v.product}`,
        status: v.status,
        href: v.youtube_url,
      });
    }

    for (const b of blogPosts) {
      const dateStr = b.published_at ?? b.created_at;
      if (!dateStr) continue;
      out.push({
        id: `blog-${b.id}`,
        kind: "blog",
        date: new Date(dateStr),
        title: truncate(b.title, 60),
        subtitle: `SEO · ${b.product}`,
        status: b.status,
        href: null,
      });
    }

    for (const m of campaigns) {
      const dateStr = m.sent_at ?? m.run_at ?? m.created_at;
      if (!dateStr) continue;
      out.push({
        id: `campaign-${m.id}`,
        kind: "campaign",
        date: new Date(dateStr),
        title: truncate(m.subject, 60),
        subtitle: `${m.channel} · ${m.product}`,
        status: m.status,
        href: null,
      });
    }

    return out;
  }, [content, videoJobs, blogPosts, campaigns, brands]);

  const filteredEvents = useMemo(() => events.filter((e) => activeKinds.has(e.kind)), [events, activeKinds]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, ActivityEvent[]>();
    for (const e of filteredEvents) {
      const key = dayKey(e.date);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [filteredEvents]);

  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calendarMonth]);

  const todayKey = dayKey(new Date());
  const selectedDayEvents = (selectedDay ? eventsByDay.get(selectedDay) ?? [] : []).sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  const monthCounts = useMemo(() => {
    const counts: Record<ActivityKind, number> = { social: 0, video: 0, blog: 0, campaign: 0 };
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    for (const e of filteredEvents) {
      if (e.date.getFullYear() === year && e.date.getMonth() === month) counts[e.kind]++;
    }
    return counts;
  }, [filteredEvents, calendarMonth]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-[#1A3A5C]">Activity Calendar</h2>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(KIND_LABEL) as ActivityKind[]).map((k) => (
            <button
              key={k}
              onClick={() => toggleKind(k)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                activeKinds.has(k) ? "bg-white border-[#B8860B] text-slate-700" : "bg-slate-100 border-slate-200 text-slate-400"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${KIND_DOT[k]}`} />
              {KIND_LABEL[k]} ({monthCounts[k]})
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          className="text-sm text-slate-500 hover:text-[#1A3A5C] px-2"
        >
          ← Prev
        </button>
        <p className="text-sm font-semibold text-[#1A3A5C]">
          {calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </p>
        <button
          onClick={() => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          className="text-sm text-slate-500 hover:text-[#1A3A5C] px-2"
        >
          Next →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-4">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400 py-1">
            {d}
          </div>
        ))}
        {calendarCells.map((date, i) => {
          if (!date) return <div key={i} className="min-h-[84px] rounded-lg" />;
          const key = dayKey(date);
          const dayEvents = eventsByDay.get(key) ?? [];
          const isToday = key === todayKey;
          const isSelected = key === selectedDay;
          return (
            <button
              key={i}
              onClick={() => setSelectedDay(key === selectedDay ? null : key)}
              className={`min-h-[84px] rounded-lg border p-1.5 text-left align-top transition-colors ${
                isSelected
                  ? "border-purple-500 bg-purple-50"
                  : isToday
                    ? "border-sky-500 bg-sky-50"
                    : "border-slate-200 bg-white hover:border-slate-400"
              }`}
            >
              <span className={`text-xs ${isToday ? "text-sky-600 font-semibold" : "text-slate-500"}`}>
                {date.getDate()}
              </span>
              <div className="mt-1 space-y-0.5">
                {dayEvents.slice(0, 3).map((e) => (
                  <div key={e.id} className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${KIND_DOT[e.kind]}`} />
                    <span className="text-[10px] text-slate-500 truncate">{e.title}</span>
                  </div>
                ))}
                {dayEvents.length > 3 && <p className="text-[10px] text-slate-400">+{dayEvents.length - 3} more</p>}
              </div>
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div>
          <p className="text-sm font-semibold text-[#1A3A5C] mb-3">
            {parseDayKey(selectedDay).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            {selectedDayEvents.length === 0 && <span className="text-slate-400 font-normal"> — nothing that day</span>}
          </p>
          <div className="space-y-2">
            {selectedDayEvents.map((e) => (
              <div key={e.id} className="bg-white border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${KIND_BADGE[e.kind]}`}>
                      {KIND_LABEL[e.kind]}
                    </span>
                    <span className="text-xs text-slate-400">{e.subtitle}</span>
                  </div>
                  <p className="text-sm text-slate-700 truncate" title={e.title}>
                    {e.href ? (
                      <a href={e.href} target="_blank" rel="noopener noreferrer" className="hover:underline">
                        {e.title}
                      </a>
                    ) : (
                      e.title
                    )}
                  </p>
                </div>
                <span className="text-xs text-slate-500 capitalize whitespace-nowrap">{e.status.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
