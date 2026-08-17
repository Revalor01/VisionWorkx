"use client";

import { useState } from "react";
import type { SocialBrand, SocialContent, SocialVideoAsset, SocialInboxItem } from "@/lib/database.types";
import BrandsTab from "./BrandsTab";
import ContentTab from "./ContentTab";
import VideoTab from "./VideoTab";
import InboxTab from "./InboxTab";
import RecapTab from "./RecapTab";
import HelpTab from "./HelpTab";

type Tab = "brands" | "content" | "video" | "inbox" | "recap" | "help";

export default function SocialDashboard({
  isAdmin,
  initialBrands,
  initialContent,
  initialVideoAssets,
  initialInboxItems,
}: {
  isAdmin: boolean;
  initialBrands: SocialBrand[];
  initialContent: SocialContent[];
  initialVideoAssets: SocialVideoAsset[];
  initialInboxItems: SocialInboxItem[];
}) {
  const [tab, setTab] = useState<Tab>(isAdmin ? "brands" : "video");
  const [brands, setBrands] = useState(initialBrands);
  const [content, setContent] = useState(initialContent);
  const [videoAssets, setVideoAssets] = useState(initialVideoAssets);
  const [inboxItems, setInboxItems] = useState(initialInboxItems);

  const openInboxCount = inboxItems.filter((i) => i.status === "open" && i.classification === "requires_human").length;

  const TABS: Tab[] = isAdmin ? ["brands", "content", "video", "inbox", "recap", "help"] : ["video"];

  return (
    <div className="min-h-screen bg-blue-50">
      <header className="bg-[#1A3A5C] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight">Revalor</span>
          <span className="text-xs bg-black/20 px-2 py-0.5 rounded-full font-medium">Social Media</span>
        </div>
        {isAdmin && (
          <a
            href="https://revalor-admin.vercel.app"
            className="text-xs text-white/70 hover:text-white transition-colors"
          >
            ← Back to Admin
          </a>
        )}
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1A3A5C]">Social Media Manager</h1>
          <p className="text-slate-500 text-sm mt-1">Facebook &amp; Instagram — internal Revalor use only</p>
        </div>

        <div className="flex gap-1 mb-6 bg-white border border-green-600 rounded-xl p-1 w-full sm:w-fit overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 sm:px-5 py-2 rounded-lg text-sm font-medium capitalize transition-colors shrink-0 relative ${
                tab === t ? "bg-[#1A3A5C] text-white" : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {t}
              {t === "inbox" && openInboxCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-red-500 text-white rounded-full">
                  {openInboxCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === "brands" && <BrandsTab brands={brands} setBrands={setBrands} />}
        {tab === "content" && <ContentTab brands={brands} content={content} setContent={setContent} videoAssets={videoAssets} />}
        {tab === "video" && <VideoTab brands={brands} videoAssets={videoAssets} setVideoAssets={setVideoAssets} />}
        {tab === "inbox" && <InboxTab brands={brands} inboxItems={inboxItems} setInboxItems={setInboxItems} />}
        {tab === "recap" && <RecapTab />}
        {tab === "help" && <HelpTab />}
      </div>
    </div>
  );
}
