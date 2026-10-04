"use client";

import { useState } from "react";
import type { SocialContent } from "@/lib/database.types";

type PreviewPost = {
  platform: "facebook" | "instagram";
  caption: string;
  hashtags: string[];
  linkUrl: string | null;
  scheduledAt: string;
  status: "scheduled" | "draft";
};

// Paste a campaign of finished posts ({ brand, posts: [...] }), check the
// preview, then import. See lib/social/campaignImport.ts for the format.
export default function ImportPostsModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (rows: SocialContent[]) => void;
}) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<{ brand: string; posts: PreviewPost[] } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function send(dry: boolean) {
    setErrors([]);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setErrors(["That isn't valid JSON — paste the whole campaign file."]);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/social/content/import${dry ? "?dry=1" : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const body = await res.json();
      if (!res.ok) {
        setErrors([body.error ?? `HTTP ${res.status}`, ...(body.errors ?? [])]);
        setPreview(null);
        return;
      }
      if (dry) setPreview(body);
      else onImported(body.content);
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      setBusy(false);
    }
  }

  const fbCount = preview?.posts.filter((p) => p.platform === "facebook").length ?? 0;
  const igCount = preview?.posts.filter((p) => p.platform === "instagram").length ?? 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white border border-green-600 rounded-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-bold text-[#1A3A5C] mb-1">Import posts</h3>
        <p className="text-xs text-slate-500 mb-3">
          Paste a campaign file. Facebook posts are scheduled straight away. Instagram posts arrive as drafts on their
          planned time: generate an image for each, then click Schedule.
        </p>

        {errors.length > 0 && (
          <div className="mb-3 p-2 rounded-lg bg-red-100 border border-red-300 text-red-700 text-sm">
            {errors.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        )}

        {!preview ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'{ "brand": "Revalor LLC", "posts": [ { "platform": "facebook", "caption": "…", "linkUrl": "https://…", "scheduledAt": "2026-10-12T10:00:00-04:00" } ] }'}
            className="w-full h-72 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono mb-4"
          />
        ) : (
          <div className="mb-4">
            <p className="text-sm text-slate-700 mb-2">
              <span className="font-semibold">{preview.brand}</span>: {fbCount} Facebook (scheduled) · {igCount} Instagram
              (drafts)
            </p>
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-200">
              {preview.posts.map((p, i) => (
                <div key={i} className="p-3 text-sm">
                  <div className="flex gap-2 text-xs text-slate-500 mb-1">
                    <span className="capitalize font-medium text-[#1A3A5C]">{p.platform}</span>
                    <span>{new Date(p.scheduledAt).toLocaleString()}</span>
                    <span>{p.status === "scheduled" ? "scheduled" : "draft — needs an image"}</span>
                  </div>
                  <p className="text-slate-700 whitespace-pre-wrap line-clamp-3">{p.caption}</p>
                  {p.linkUrl && <p className="text-xs text-sky-700 mt-1 break-all">{p.linkUrl}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm">
            Cancel
          </button>
          {preview ? (
            <>
              <button onClick={() => setPreview(null)} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm">
                Back
              </button>
              <button
                onClick={() => send(false)}
                disabled={busy}
                className="flex-1 px-4 py-2 rounded-lg bg-[#1A3A5C] text-white text-sm font-medium disabled:opacity-50"
              >
                {busy ? "Importing…" : `Import ${preview.posts.length} posts`}
              </button>
            </>
          ) : (
            <button
              onClick={() => send(true)}
              disabled={busy || !text.trim()}
              className="flex-1 px-4 py-2 rounded-lg bg-[#1A3A5C] text-white text-sm font-medium disabled:opacity-50"
            >
              {busy ? "Checking…" : "Preview"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
