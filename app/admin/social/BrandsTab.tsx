"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { SocialBrand } from "@/lib/database.types";

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

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<Record<string, { voiceNotes: string; faqDocument: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);

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
    return editing[brand.id] ?? { voiceNotes: brand.voice_notes ?? "", faqDocument: brand.faq_document ?? "" };
  }

  function updateField(brandId: string, field: "voiceNotes" | "faqDocument", value: string) {
    const brand = brands.find((b) => b.id === brandId)!;
    setEditing((prev) => ({
      ...prev,
      [brandId]: { ...(prev[brandId] ?? { voiceNotes: brand.voice_notes ?? "", faqDocument: brand.faq_document ?? "" }), [field]: value },
    }));
  }

  async function saveBrand(brand: SocialBrand) {
    const fields = fieldsFor(brand);
    setSaving(brand.id);
    try {
      await fetch(`/api/social/brands/${brand.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceNotes: fields.voiceNotes, faqDocument: fields.faqDocument }),
      });
      setBrands((prev) =>
        prev.map((b) => (b.id === brand.id ? { ...b, voice_notes: fields.voiceNotes, faq_document: fields.faqDocument } : b))
      );
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      {connected && (
        <div className="mb-4 p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
          Connected Facebook Page &ldquo;{connected}&rdquo; successfully.
        </div>
      )}
      {connectError && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          Facebook connection failed ({connectError}). Try again from the brand card below.
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
        <div className="mb-4 p-4 bg-white border border-gray-200 rounded-xl flex gap-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. VisionWorkx"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
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
            <div key={brand.id} className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex justify-between items-start mb-3">
                <h3 className="font-semibold text-[#1A3A5C]">{brand.name}</h3>
                {brand.fb_page_id ? (
                  <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                    Connected
                  </span>
                ) : (
                  <a
                    href={`/api/social/connect/facebook/connect?brandId=${brand.id}`}
                    className="text-xs font-medium text-[#1877F2] hover:underline"
                  >
                    Connect Facebook
                  </a>
                )}
              </div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Brand voice notes</label>
              <textarea
                value={fields.voiceNotes}
                onChange={(e) => updateField(brand.id, "voiceNotes", e.target.value)}
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 resize-none"
                placeholder="Confident, founder-built, no corporate jargon..."
              />
              <label className="block text-xs font-medium text-gray-500 mb-1">FAQ document (used for DM auto-reply)</label>
              <textarea
                value={fields.faqDocument}
                onChange={(e) => updateField(brand.id, "faqDocument", e.target.value)}
                rows={4}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 resize-none"
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
    return <div className="mb-4 p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">Connected — refresh to see the update.</div>;
  }

  return (
    <div className="mb-4 p-4 bg-white border border-gray-200 rounded-xl">
      <p className="text-sm font-medium text-[#1A3A5C] mb-3">Multiple Facebook Pages found — pick the one for this brand:</p>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      {pages === null && !error && <p className="text-sm text-gray-500">Loading…</p>}
      <div className="flex flex-wrap gap-2">
        {pages?.map((p) => (
          <button
            key={p.pageId}
            onClick={() => choosePage(p.pageId)}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm hover:border-[#1A3A5C] transition-colors"
          >
            {p.pageName}
          </button>
        ))}
      </div>
    </div>
  );
}
