"use client";

import { useState } from "react";
import type { SocialBrand, SocialInboxItem } from "@/lib/database.types";

export default function InboxTab({
  brands,
  inboxItems,
  setInboxItems,
}: {
  brands: SocialBrand[];
  inboxItems: SocialInboxItem[];
  setInboxItems: React.Dispatch<React.SetStateAction<SocialInboxItem[]>>;
}) {
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");

  async function resolve(id: string) {
    await fetch(`/api/social/inbox/${id}`, { method: "PATCH" });
    setInboxItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: "resolved", resolved_at: new Date().toISOString() } : i))
    );
  }

  function brandName(id: string) {
    return brands.find((b) => b.id === id)?.name ?? "—";
  }

  const filtered = inboxItems.filter((i) => filter === "all" || i.status === filter);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-white">Inbox</h2>
        <div className="flex gap-2">
          {(["open", "resolved", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
                filter === f ? "bg-[#1A3A5C] text-white" : "bg-black border border-green-600 text-zinc-300"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-black border border-dashed border-zinc-700 rounded-xl p-10 text-center text-zinc-500 text-sm">
          Nothing here.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div key={item.id} className="bg-[#0d0d0d] border border-green-600 rounded-xl p-4">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-zinc-400">{brandName(item.brand_id)}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 capitalize">{item.platform}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 uppercase">{item.source_type}</span>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                      item.classification === "auto_answered" ? "bg-green-900/40 text-green-300" : "bg-red-900/40 text-red-300"
                    }`}
                  >
                    {item.classification === "auto_answered" ? "Auto-answered" : "Needs you"}
                  </span>
                </div>
                <span className="text-xs text-zinc-500">{new Date(item.created_at).toLocaleString()}</span>
              </div>

              <p className="text-sm text-zinc-200 mb-2">
                <span className="font-medium">{item.sender_name ?? item.sender_id}:</span> {item.message_text}
              </p>

              {item.auto_reply_text && (
                <p className="text-sm text-green-400 bg-green-950/40 rounded-lg px-3 py-2 mb-2">
                  Auto-reply sent: {item.auto_reply_text}
                </p>
              )}

              {item.status === "open" && (
                <button onClick={() => resolve(item.id)} className="text-xs font-medium text-white hover:underline">
                  Mark resolved
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
