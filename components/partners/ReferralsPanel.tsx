"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ReferralRow {
  id: string;
  referred_business_name: string;
  status: string;
  created_at: string;
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  submitted: { label: "Submitted", cls: "bg-gray-100 text-gray-600" },
  contacted: { label: "Contacted", cls: "bg-amber-100 text-amber-700" },
  converted: { label: "Converted", cls: "bg-green-100 text-green-700" },
  declined: { label: "Declined", cls: "bg-red-100 text-red-700" },
};

export default function ReferralsPanel({
  referralCode,
  convertedReferralCount,
  referralBonusDiscountPercentage,
  initialReferrals,
}: {
  referralCode: string | null;
  convertedReferralCount: number;
  referralBonusDiscountPercentage: number;
  initialReferrals: ReferralRow[];
}) {
  const router = useRouter();
  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!businessName.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/partners/referrals/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referredBusinessName: businessName,
          referredContactName: contactName,
          referredEmail: email,
          referredPhone: phone,
          notes,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setBusinessName("");
      setContactName("");
      setEmail("");
      setPhone("");
      setNotes("");
      setSubmitted(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Your Referral Code</p>
        <p className="text-lg font-bold text-navy-dark font-mono">{referralCode ?? "—"}</p>
        {referralBonusDiscountPercentage > 0 ? (
          <p className="text-sm text-green-600 mt-2">
            +{referralBonusDiscountPercentage}% bonus discount unlocked from {convertedReferralCount} converted
            referral{convertedReferralCount === 1 ? "" : "s"}
          </p>
        ) : (
          <p className="text-sm text-gray-400 mt-2">
            Refer 3 businesses that convert to unlock a +5% bonus discount ({convertedReferralCount}/3 so far).
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h2 className="font-semibold text-navy-dark mb-4">Refer a Business</h2>
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
        )}
        {submitted && (
          <div className="mb-4 p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
            Referral submitted — thanks!
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            required
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Business name"
            className={inputCls}
          />
          <input
            type="text"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Contact name (optional)"
            className={inputCls}
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email (optional)"
              className={inputCls}
            />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone (optional)"
              className={inputCls}
            />
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={2}
            className={`${inputCls} resize-none`}
          />
          <button
            type="submit"
            disabled={!businessName.trim() || loading}
            className="w-full bg-navy-dark text-white font-semibold py-2.5 rounded-xl hover:bg-navy transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Submitting…" : "Submit Referral"}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <h2 className="font-semibold text-navy-dark px-6 pt-6 pb-2">Your Referrals</h2>
        {initialReferrals.length === 0 ? (
          <p className="text-sm text-gray-400 px-6 pb-6">No referrals submitted yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {initialReferrals.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-6 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{r.referred_business_name}</p>
                  <p className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[r.status]?.cls ?? "bg-gray-100 text-gray-600"}`}>
                  {STATUS_STYLE[r.status]?.label ?? r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const inputCls =
  "w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy focus:border-transparent";
