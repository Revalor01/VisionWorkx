"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { SocialBrand } from "@/lib/database.types";
import { FacebookIcon, InstagramIcon, TikTokIcon, YouTubeIcon } from "./PlatformIcons";

const BRAND_LOGOS: Record<string, string> = {
  VisionWorkx: "/VisionWorks.png",
  "Revalor Kids": "/revalor-kids-logo.png",
  "Revalor LLC": "/revalor-logo.png",
  "Revalor Wellness": "/revalor-wellness-logo.png",
};

// Purely informational "covers" badge on VisionWorkx's card — the listed
// items are NOT merged into VisionWorkx's own social connections, they're
// separate brand rows/cards with their own accounts. Just shows at a
// glance what a post under this brand is repping, same pattern as Revalor
// Kids covering Chorebit/FeelFlow/MindBit below.
const COVERS_BY_BRAND: Record<string, { name: string; logo?: string }[]> = {
  "Revalor Kids": [
    { name: "Chorebit", logo: "/chorebit-logo.png" },
    { name: "FeelFlow", logo: "/feelflow-logo.png" },
    { name: "MindBit", logo: "/mindbit-logo.png" },
  ],
  VisionWorkx: [
    { name: "VisionWorkx", logo: "/VisionWorks.png" },
    { name: "Revalor Kids", logo: "/revalor-kids-logo.png" },
    { name: "Revalor Wellness", logo: "/revalor-wellness-logo.png" },
  ],
};

// Explicit display order per the current brand hierarchy — Revalor LLC
// (the corporate/parent account) first, then VisionWorkx and what it
// covers, in reading order. Anything not listed here (a brand added
// later) sorts alphabetically after these.
const BRAND_ORDER = ["Revalor LLC", "VisionWorkx", "Revalor Kids", "Revalor Wellness"];

function sortBrands(brands: SocialBrand[]): SocialBrand[] {
  return [...brands].sort((a, b) => {
    const ai = BRAND_ORDER.indexOf(a.name);
    const bi = BRAND_ORDER.indexOf(b.name);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.name.localeCompare(b.name);
  });
}

export default function BrandsTab(props: {
  brands: SocialBrand[];
  setBrands: React.Dispatch<React.SetStateAction<SocialBrand[]>>;
}) {
  return (
    <Suspense fallback={null}>
      <BrandsTabInner {...props} />
    </Suspense>
  );
}

function BrandsTabInner({
  brands,
  setBrands,
}: {
  brands: SocialBrand[];
  setBrands: React.Dispatch<React.SetStateAction<SocialBrand[]>>;
}) {
  const searchParams = useSearchParams();
  const connectSession = searchParams.get("connectSession");
  const connectError = searchParams.get("connectError");
  const connected = searchParams.get("connected");
  const socialapiConnected = searchParams.get("socialapi_connected");
  const socialapiError = searchParams.get("socialapi_error");

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<Record<string, { voiceNotes: string; faqDocument: string; websiteUrl: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  // Real connected-account identity (avatar + @username), keyed by
  // socialapi_account_id / socialapi_tiktok_account_id — lets a mismatch
  // (a brand pointing at another brand's real account) be caught at a
  // glance instead of only discovered after a post goes out to the wrong
  // account. Covers every SocialAPI-connected platform, not just Instagram.
  const [connectedAccounts, setConnectedAccounts] = useState<Record<string, { username: string | null; profilePictureUrl: string | null }>>({});

  useEffect(() => {
    fetch("/api/admin/social/socialapi/accounts")
      .then((r) => r.json())
      .then((body) => {
        if (!body.accounts) return;
        const map: Record<string, { username: string | null; profilePictureUrl: string | null }> = {};
        for (const a of body.accounts) {
          map[a.id] = { username: a.username, profilePictureUrl: a.profilePictureUrl };
        }
        setConnectedAccounts(map);
      })
      .catch(() => {});
  }, []);

  async function addBrand() {
    if (!newName.trim()) return;
    const res = await fetch("/api/social/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (res.ok) {
      const { brand } = await res.json();
      setBrands((prev) => [...prev, brand].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      setShowAddForm(false);
    }
  }

  function fieldsFor(brand: SocialBrand) {
    return (
      editing[brand.id] ?? {
        voiceNotes: brand.voice_notes ?? "",
        faqDocument: brand.faq_document ?? "",
        websiteUrl: brand.website_url ?? "",
      }
    );
  }

  function updateField(brandId: string, field: "voiceNotes" | "faqDocument" | "websiteUrl", value: string) {
    const brand = brands.find((b) => b.id === brandId)!;
    setEditing((prev) => ({
      ...prev,
      [brandId]: {
        ...(prev[brandId] ?? {
          voiceNotes: brand.voice_notes ?? "",
          faqDocument: brand.faq_document ?? "",
          websiteUrl: brand.website_url ?? "",
        }),
        [field]: value,
      },
    }));
  }

  async function saveBrand(brand: SocialBrand) {
    const fields = fieldsFor(brand);
    setSaving(brand.id);
    try {
      await fetch(`/api/social/brands/${brand.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceNotes: fields.voiceNotes, faqDocument: fields.faqDocument, websiteUrl: fields.websiteUrl }),
      });
      setBrands((prev) =>
        prev.map((b) =>
          b.id === brand.id
            ? { ...b, voice_notes: fields.voiceNotes, faq_document: fields.faqDocument, website_url: fields.websiteUrl || null }
            : b
        )
      );
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      {connected && (
        <div className="mb-4 p-3 rounded-xl bg-green-100 border border-green-300 text-green-700 text-sm">
          Connected Facebook Page &ldquo;{connected}&rdquo; successfully.
        </div>
      )}
      {connectError && (
        <div className="mb-4 p-3 rounded-xl bg-red-100 border border-red-300 text-red-700 text-sm">
          Facebook connection failed ({connectError}). Try again from the brand card below.
        </div>
      )}
      {socialapiConnected && (
        <div className="mb-4 p-3 rounded-xl bg-green-100 border border-green-300 text-green-700 text-sm">
          Instagram account connected successfully.
        </div>
      )}
      {socialapiError && (
        <div className="mb-4 p-3 rounded-xl bg-red-100 border border-red-300 text-red-700 text-sm">
          Instagram connection failed ({socialapiError}). Try again from the brand card below.
        </div>
      )}
      {connectSession && <ConnectPicker sessionId={connectSession} setBrands={setBrands} />}

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-[#1A3A5C]">Brands</h2>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="px-4 py-2 rounded-lg bg-[#1A3A5C] text-white text-sm font-medium hover:bg-[#15304a] transition-colors"
        >
          + Add Brand
        </button>
      </div>

      {showAddForm && (
        <div className="mb-4 p-4 bg-white border border-green-600 rounded-xl flex gap-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. VisionWorkx"
            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />
          <button onClick={addBrand} className="px-4 py-2 rounded-lg bg-[#1A3A5C] text-white text-sm font-medium">
            Create
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {sortBrands(brands).map((brand) => {
          const fields = fieldsFor(brand);
          const covers = COVERS_BY_BRAND[brand.name];
          return (
            <div key={brand.id}>
              <div className="flex items-center gap-2 mb-2 px-1">
                {BRAND_LOGOS[brand.name] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={BRAND_LOGOS[brand.name]} alt={`${brand.name} logo`} className="w-8 h-8 rounded-lg object-contain" />
                )}
                <h3 className="font-semibold text-[#1A3A5C]">{brand.name}</h3>
              </div>
              <div className="bg-white border border-green-600 rounded-xl p-5">
              <div className="grid grid-cols-2 gap-2 mb-4">
                <PlatformRow
                  icon={<FacebookIcon active={!!brand.fb_page_id} />}
                  label="Facebook"
                  connected={!!brand.fb_page_id}
                  connectHref={`/api/social/connect/facebook/connect?brandId=${brand.id}`}
                  connectColor="#1877F2"
                  extra={
                    brand.fb_page_id && (
                      <>
                        <a
                          href={`/api/social/connect/facebook/connect?brandId=${brand.id}`}
                          className="text-[10px] text-slate-400 hover:text-slate-600 hover:underline"
                          title="Re-run Facebook connect — use this after linking an Instagram account to this Page, to pull it in"
                        >
                          Reconnect
                        </a>
                        {brand.socialapi_facebook_account_id ? (
                          <span className="text-[10px] text-green-700" title="DMs/comments for this Page are connected via SocialAPI">
                            · DMs on
                          </span>
                        ) : (
                          <a
                            href={`/api/admin/social/socialapi/connect?brand_id=${brand.id}&platform=facebook-inbox`}
                            className="text-[10px] text-slate-400 hover:text-slate-600 hover:underline"
                            title="Connect this Page's DMs/comments — separate from posting, powered by SocialAPI"
                          >
                            · Connect DMs
                          </a>
                        )}
                      </>
                    )
                  }
                />
                <PlatformRow
                  icon={<InstagramIcon active={!!brand.socialapi_account_id} uid={brand.id} />}
                  label="Instagram"
                  connected={!!brand.socialapi_account_id}
                  account={brand.socialapi_account_id ? connectedAccounts[brand.socialapi_account_id] : undefined}
                  connectHref={`/api/admin/social/socialapi/connect?brand_id=${brand.id}`}
                  connectColor="#BC3081"
                />
                <PlatformRow
                  icon={<TikTokIcon active={!!brand.socialapi_tiktok_account_id} />}
                  label="TikTok"
                  connected={!!brand.socialapi_tiktok_account_id}
                  account={brand.socialapi_tiktok_account_id ? connectedAccounts[brand.socialapi_tiktok_account_id] : undefined}
                  connectHref={`/api/admin/social/socialapi/connect?brand_id=${brand.id}&platform=tiktok`}
                  connectColor="#000000"
                />
                <PlatformRow
                  icon={<YouTubeIcon active={!!brand.socialapi_youtube_account_id} />}
                  label="YouTube"
                  connected={!!brand.socialapi_youtube_account_id}
                  account={brand.socialapi_youtube_account_id ? connectedAccounts[brand.socialapi_youtube_account_id] : undefined}
                  connectHref={`/api/admin/social/socialapi/connect?brand_id=${brand.id}&platform=youtube`}
                  connectColor="#FF0000"
                />
              </div>
              {covers && (
                <div className="flex items-center gap-3 flex-wrap mb-4 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Covers</span>
                  {covers.map((p) => (
                    <div key={p.name} className="flex items-center gap-1.5" title={p.name}>
                      {p.logo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.logo} alt={`${p.name} logo`} className="w-5 h-5 rounded object-contain" />
                      )}
                      <span className="text-xs text-slate-600">{p.name}</span>
                    </div>
                  ))}
                </div>
              )}
              <label className="block text-xs font-medium text-slate-500 mb-1">Website link (added to Facebook posts)</label>
              <input
                value={fields.websiteUrl}
                onChange={(e) => updateField(brand.id, "websiteUrl", e.target.value)}
                placeholder="https://chorebit.vercel.app"
                className="w-full border border-green-600 rounded-lg px-3 py-2 text-sm mb-3"
              />
              <label className="block text-xs font-medium text-slate-500 mb-1">Brand voice notes</label>
              <textarea
                value={fields.voiceNotes}
                onChange={(e) => updateField(brand.id, "voiceNotes", e.target.value)}
                rows={2}
                className="w-full border border-green-600 rounded-lg px-3 py-2 text-sm mb-3 resize-none"
                placeholder="Confident, founder-built, no corporate jargon..."
              />
              <label className="block text-xs font-medium text-slate-500 mb-1">FAQ document (used for DM auto-reply)</label>
              <textarea
                value={fields.faqDocument}
                onChange={(e) => updateField(brand.id, "faqDocument", e.target.value)}
                rows={4}
                className="w-full border border-green-600 rounded-lg px-3 py-2 text-sm mb-3 resize-none"
                placeholder="Q: How much does it cost? A: ..."
              />
              <button
                onClick={() => saveBrand(brand)}
                disabled={saving === brand.id}
                className="text-sm font-medium text-[#1A3A5C] hover:underline disabled:opacity-50"
              >
                {saving === brand.id ? "Saving…" : "Save"}
              </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// One row per platform inside a brand card — replaces the old wrapped
// row of icon+badge+avatar+link per platform, which got unreadable once
// a 4th and 5th platform (YouTube, and previously TikTok) were added.
function PlatformRow({
  icon,
  label,
  connected,
  account,
  connectHref,
  connectColor,
  extra,
}: {
  icon: React.ReactNode;
  label: string;
  connected: boolean;
  account?: { username: string | null; profilePictureUrl: string | null };
  connectHref: string;
  connectColor: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 py-2 px-2 bg-slate-50 border border-slate-100 rounded-lg">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-xs font-medium text-slate-600">{label}</span>
      </div>
      {connected ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          {account ? (
            <span className="flex items-center gap-1.5" title={`Real connected ${label} account — verify this matches the brand`}>
              {account.profilePictureUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={account.profilePictureUrl}
                  alt={`Connected ${label} account`}
                  className="w-4 h-4 rounded-full object-cover border border-slate-200"
                />
              )}
              <span className="text-[11px] text-slate-500">{account.username ? `@${account.username}` : "Connected"}</span>
            </span>
          ) : (
            <span className="text-[11px] font-medium text-green-700">Connected</span>
          )}
          {extra}
        </div>
      ) : (
        <a href={connectHref} className="text-[11px] font-medium hover:underline" style={{ color: connectColor }}>
          Connect
        </a>
      )}
    </div>
  );
}

function ConnectPicker({
  sessionId,
  setBrands,
}: {
  sessionId: string;
  setBrands: React.Dispatch<React.SetStateAction<SocialBrand[]>>;
}) {
  const [pages, setPages] = useState<{ pageId: string; pageName: string }[] | null>(null);
  const [brandId, setBrandId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/social/connect/facebook/session/${sessionId}`)
      .then((r) => r.json())
      .then((body) => {
        if (body.error) setError(body.error);
        else {
          setPages(body.pages);
          setBrandId(body.brandId);
        }
      });
  }, [sessionId]);

  async function choosePage(pageId: string) {
    const res = await fetch("/api/social/connect/facebook/finalize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, pageId }),
    });
    const body = await res.json();
    if (res.ok) {
      setDone(true);
      setBrands((prev) => prev.map((b) => (b.id === brandId ? { ...b, fb_page_id: pageId } : b)));
    } else {
      setError(body.error ?? "Failed to connect");
    }
  }

  if (done) {
    return <div className="mb-4 p-3 rounded-xl bg-green-100 border border-green-300 text-green-700 text-sm">Connected — refresh to see the update.</div>;
  }

  return (
    <div className="mb-4 p-4 bg-white border border-green-600 rounded-xl">
      <p className="text-sm font-medium text-[#1A3A5C] mb-3">Multiple Facebook Pages found — pick the one for this brand:</p>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {pages === null && !error && <p className="text-sm text-slate-500">Loading…</p>}
      <div className="flex flex-wrap gap-2">
        {pages?.map((p) => (
          <button
            key={p.pageId}
            onClick={() => choosePage(p.pageId)}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm text-[#1A3A5C] hover:border-[#1A3A5C] transition-colors"
          >
            {p.pageName}
          </button>
        ))}
      </div>
    </div>
  );
}
