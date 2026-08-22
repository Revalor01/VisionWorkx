"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { SocialBrand } from "@/lib/database.types";

const BRAND_LOGOS: Record<string, string> = {
  VisionWorkx: "/VisionWorks.png",
  "Revalor Kids": "/revalor-kids-logo.png",
};

// "Revalor Kids" is an umbrella brand covering three separate apps —
// show each one so it's clear at a glance what content under this
// brand is actually promoting.
const REVALOR_KIDS_PRODUCTS = [
  { name: "Chorebit", logo: "/chorebit-logo.png" },
  { name: "FeelFlow", logo: "/feelflow-logo.png" },
  { name: "MindBit", logo: "/mindbit-logo.png" },
];

function FacebookIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`w-5 h-5 ${active ? "" : "opacity-30 grayscale"}`}>
      <path
        fill="#1877F2"
        d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.51 1.49-3.9 3.77-3.9 1.09 0 2.23.2 2.23.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.44 2.91h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94Z"
      />
    </svg>
  );
}

function InstagramIcon({ active, uid }: { active: boolean; uid: string }) {
  const gradId = `ig-gradient-${uid}`;
  return (
    <svg viewBox="0 0 24 24" className={`w-5 h-5 ${active ? "" : "opacity-30 grayscale"}`}>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FED576" />
          <stop offset="26%" stopColor="#F47133" />
          <stop offset="61%" stopColor="#BC3081" />
          <stop offset="100%" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradId})`}
        d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"
      />
    </svg>
  );
}

function TikTokIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`w-5 h-5 ${active ? "" : "opacity-30 grayscale"}`}>
      <path
        fill="#000000"
        d="M16.6 5.82c-.9-.98-1.39-2.26-1.39-3.6h-3.09v13.79c0 1.66-1.34 3-3 3s-3-1.34-3-3 1.34-3 3-3c.31 0 .61.05.9.13V9.9a6.14 6.14 0 0 0-.9-.07c-3.36 0-6.09 2.73-6.09 6.09s2.73 6.08 6.09 6.08 6.08-2.72 6.08-6.08V8.86a9.15 9.15 0 0 0 5.33 1.71V7.48a5.6 5.6 0 0 1-3.93-1.66z"
      />
    </svg>
  );
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
        {brands.map((brand) => {
          const fields = fieldsFor(brand);
          return (
            <div key={brand.id} className="bg-white border border-green-600 rounded-xl p-5">
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  {BRAND_LOGOS[brand.name] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={BRAND_LOGOS[brand.name]} alt={`${brand.name} logo`} className="w-8 h-8 rounded-lg object-contain" />
                  )}
                  <h3 className="font-semibold text-[#1A3A5C]">{brand.name}</h3>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <FacebookIcon active={!!brand.fb_page_id} />
                  <InstagramIcon active={!!brand.socialapi_account_id} uid={brand.id} />
                  <TikTokIcon active={!!brand.socialapi_tiktok_account_id} />
                  {brand.socialapi_account_id ? (
                    <>
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                        IG Connected
                      </span>
                      {connectedAccounts[brand.socialapi_account_id] && (
                        <span className="flex items-center gap-1" title="Real connected Instagram account — verify this matches the brand">
                          {connectedAccounts[brand.socialapi_account_id].profilePictureUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={connectedAccounts[brand.socialapi_account_id].profilePictureUrl!}
                              alt="Connected Instagram account"
                              className="w-5 h-5 rounded-full object-cover border border-slate-200"
                            />
                          )}
                          <span className="text-[10px] text-slate-500">
                            @{connectedAccounts[brand.socialapi_account_id].username ?? "?"}
                          </span>
                        </span>
                      )}
                    </>
                  ) : (
                    <a
                      href={`/api/admin/social/socialapi/connect?brand_id=${brand.id}`}
                      className="text-xs font-medium text-[#BC3081] hover:underline"
                    >
                      Connect Instagram
                    </a>
                  )}
                  {brand.fb_page_id ? (
                    <>
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                        FB Connected
                      </span>
                      <a
                        href={`/api/social/connect/facebook/connect?brandId=${brand.id}`}
                        className="text-[10px] font-medium text-[#1877F2] hover:underline"
                        title="Re-run Facebook connect — use this after linking an Instagram account to this Page, to pull it in"
                      >
                        Reconnect
                      </a>
                    </>
                  ) : (
                    <a
                      href={`/api/social/connect/facebook/connect?brandId=${brand.id}`}
                      className="text-xs font-medium text-[#1877F2] hover:underline"
                    >
                      Connect Facebook
                    </a>
                  )}
                  {brand.socialapi_tiktok_account_id ? (
                    <>
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                        TikTok Connected
                      </span>
                      {connectedAccounts[brand.socialapi_tiktok_account_id] && (
                        <span className="flex items-center gap-1" title="Real connected TikTok account — verify this matches the brand">
                          {connectedAccounts[brand.socialapi_tiktok_account_id].profilePictureUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={connectedAccounts[brand.socialapi_tiktok_account_id].profilePictureUrl!}
                              alt="Connected TikTok account"
                              className="w-5 h-5 rounded-full object-cover border border-slate-200"
                            />
                          )}
                          <span className="text-[10px] text-slate-500">
                            @{connectedAccounts[brand.socialapi_tiktok_account_id].username ?? "?"}
                          </span>
                        </span>
                      )}
                    </>
                  ) : (
                    <a
                      href={`/api/admin/social/socialapi/connect?brand_id=${brand.id}&platform=tiktok`}
                      className="text-xs font-medium text-black hover:underline"
                    >
                      Connect TikTok
                    </a>
                  )}
                </div>
              </div>
              {brand.name === "Revalor Kids" && (
                <div className="flex items-center gap-3 mb-4 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Covers</span>
                  {REVALOR_KIDS_PRODUCTS.map((p) => (
                    <div key={p.name} className="flex items-center gap-1.5" title={p.name}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.logo} alt={`${p.name} logo`} className="w-5 h-5 rounded object-contain" />
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
          );
        })}
      </div>
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
