"use client";

import { useState } from "react";

const input =
  "mt-1.5 w-full rounded-xl border border-gray-300 px-4 py-3 text-base font-normal focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20";

export default function OnboardingForm({
  initial,
}: {
  initial: { businessName: string; website: string; notificationEmail: string; termsAccepted: boolean };
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/workspace/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: f.get("businessName"),
          website: f.get("website"),
          notificationEmail: f.get("notificationEmail"),
          terms: initial.termsAccepted || f.get("terms") === "on",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.slug) throw new Error(data.error || "Something went wrong. Please try again.");
      window.location.assign(`/workspace/${data.slug}/billing?welcome=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block text-sm font-semibold text-gray-700">
        Business name
        <input name="businessName" required maxLength={100} defaultValue={initial.businessName} className={input} />
      </label>
      <label className="block text-sm font-semibold text-gray-700">
        Website your forms will go on <span className="font-normal text-gray-500">(optional for now)</span>
        <input name="website" maxLength={200} placeholder="yourbusiness.com" defaultValue={initial.website} className={input} />
      </label>
      <label className="block text-sm font-semibold text-gray-700">
        Send new-lead alerts to
        <input name="notificationEmail" type="email" required maxLength={200} defaultValue={initial.notificationEmail} className={input} />
      </label>
      {!initial.termsAccepted && (
        <label className="flex items-start gap-3 text-sm text-gray-600">
          <input name="terms" type="checkbox" required className="mt-1 h-4 w-4 rounded border-gray-300" />
          <span>
            I agree to the <a href="/terms" target="_blank" className="font-semibold text-navy hover:underline">Terms of Service</a>{" "}
            and <a href="/privacy" target="_blank" className="font-semibold text-navy hover:underline">Privacy Policy</a>.
          </span>
        </label>
      )}
      <button type="submit" disabled={busy} className="w-full rounded-xl bg-navy-dark py-3 font-semibold text-white hover:bg-navy disabled:opacity-60">
        {busy ? "Setting up…" : "Create workspace & continue"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
