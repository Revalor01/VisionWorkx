"use client";

import { useState } from "react";
import type { LinkedInPost } from "@/lib/database.types";
import { CADENCE_LABEL, LINKEDIN_CADENCES, nextSlots, type LinkedInAutomation, type LinkedInCadence } from "@/lib/social/linkedinAutomation";

// Automation controls for the Zapier LinkedIn posting (both accounts):
// on/pause, cadence, how long the run lasts, and "Fill open slots", which
// schedules approved-but-unscheduled posts into the next cadence slots.
// Every post is still approved by a person; this never writes or approves.

const DURATIONS: { label: string; weeks: number | null }[] = [
  { label: "No end date", weeks: null },
  { label: "2 weeks", weeks: 2 },
  { label: "4 weeks", weeks: 4 },
  { label: "8 weeks", weeks: 8 },
  { label: "12 weeks", weeks: 12 },
];

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function LinkedInAutomationPanel({
  settings,
  active,
  loadError,
  onSaved,
  posts,
  setPosts,
}: {
  settings: LinkedInAutomation;
  active: boolean;
  loadError: string;
  onSaved: (s: LinkedInAutomation, active: boolean) => void;
  posts: LinkedInPost[];
  setPosts: React.Dispatch<React.SetStateAction<LinkedInPost[]>>;
}) {
  const [saving, setSaving] = useState(false);
  const [filling, setFilling] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function save(patch: { enabled?: boolean; cadence?: LinkedInCadence; endsAt?: string | null }) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/social/linkedin/automation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      onSaved(body.settings, body.active);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function setDuration(weeks: number | null) {
    if (weeks === null) return save({ endsAt: null });
    const end = new Date();
    end.setDate(end.getDate() + weeks * 7);
    end.setHours(23, 59, 0, 0);
    return save({ endsAt: end.toISOString() });
  }

  const unscheduled = posts.filter((p) => p.status === "approved" && !p.scheduled_at);

  async function fillSlots() {
    setFilling(true);
    setError("");
    setMessage("");
    const taken = posts.filter((p) => p.status !== "draft").map((p) => p.scheduled_at ?? p.posted_at);
    const slots = nextSlots(settings.cadence, new Date(), unscheduled.length, taken, settings.ends_at);
    const pairs = unscheduled
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(0, slots.length)
      .map((p, i) => ({ post: p, at: slots[i] }));
    let done = 0;
    try {
      for (const { post, at } of pairs) {
        const res = await fetch(`/api/social/linkedin/${post.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scheduledAt: at.toISOString() }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setPosts((prev) => prev.map((p) => (p.id === post.id ? body.post : p)));
        done++;
      }
      const left = unscheduled.length - done;
      setMessage(
        done === 0
          ? "No open slots before the end date. Extend the run or change the cadence."
          : `Scheduled ${done} post${done === 1 ? "" : "s"}.${left > 0 ? ` ${left} didn't fit before the end date.` : ""}`,
      );
    } catch (e) {
      setError(`Scheduled ${done}, then stopped: ${(e as Error).message}`);
    } finally {
      setFilling(false);
    }
  }

  const ended = settings.enabled && settings.ends_at && !active;
  const statusText = active
    ? `On: approved posts go to the Revalor LLC page and your personal profile at their scheduled time${settings.ends_at ? `, until ${formatDay(settings.ends_at)}` : ""}.`
    : ended
      ? `Ended ${formatDay(settings.ends_at!)}. Nothing is sent. Pick a new duration to start again.`
      : "Paused: nothing is sent to either account. Scheduled posts wait until you turn it back on.";

  const currentDuration = settings.ends_at ? "custom" : "none";

  return (
    <div className="bg-white border-2 border-[#B8860B] rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <h3 className="text-base font-semibold text-[#1A3A5C]">Automation</h3>
        <button
          onClick={() => save({ enabled: !settings.enabled })}
          disabled={saving || !!loadError}
          role="switch"
          aria-checked={settings.enabled}
          className={`relative inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors disabled:opacity-50 ${
            active ? "bg-green-600 text-white hover:bg-green-700" : "bg-slate-200 text-slate-700 hover:bg-slate-300"
          }`}
        >
          <span className={`w-2.5 h-2.5 rounded-full ${active ? "bg-white" : "bg-slate-500"}`} />
          {saving ? "Saving…" : settings.enabled ? (active ? "On: click to pause" : "Ended") : "Paused: click to turn on"}
        </button>
      </div>
      <p className={`text-sm mb-4 ${active ? "text-green-700" : "text-amber-700"}`}>{statusText}</p>

      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <div className="border border-[#B8860B] rounded-lg p-3">
          <label className="block text-xs text-slate-500 mb-1">How often</label>
          <select
            value={settings.cadence}
            disabled={saving}
            onChange={(e) => save({ cadence: e.target.value as LinkedInCadence })}
            className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white"
          >
            {LINKEDIN_CADENCES.map((c) => (
              <option key={c} value={c}>
                {CADENCE_LABEL[c]}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-400 mt-1">Used for the Schedule picker and Fill open slots.</p>
        </div>
        <div className="border border-[#B8860B] rounded-lg p-3">
          <label className="block text-xs text-slate-500 mb-1">Run for</label>
          <select
            value={currentDuration}
            disabled={saving}
            onChange={(e) => {
              const d = DURATIONS.find((x) => x.label === e.target.value);
              if (d) void setDuration(d.weeks);
            }}
            className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white"
          >
            <option value="none">No end date</option>
            {settings.ends_at && <option value="custom">Until {formatDay(settings.ends_at)}</option>}
            {DURATIONS.filter((d) => d.weeks !== null).map((d) => (
              <option key={d.label} value={d.label}>
                {d.label} from today
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-400 mt-1">After the end date the automation stops on its own.</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={fillSlots}
          disabled={filling || unscheduled.length === 0}
          className="px-3 py-1.5 rounded-lg bg-[#1A3A5C] text-white text-sm font-medium hover:bg-[#15304a] disabled:opacity-50"
        >
          {filling ? "Scheduling…" : `Fill open slots${unscheduled.length ? ` (${unscheduled.length} approved)` : ""}`}
        </button>
        <span className="text-xs text-slate-500">
          {unscheduled.length === 0
            ? "No approved posts waiting for a time."
            : "Schedules approved posts into the next free slots, oldest first."}
        </span>
      </div>
      {message && <p className="text-xs text-green-700 mt-2">{message}</p>}
      {(error || loadError) && <p className="text-xs text-red-600 mt-2">{error || loadError}</p>}
    </div>
  );
}
