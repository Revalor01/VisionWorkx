"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AcceptAgreementButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAccept() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/partners/agreement/accept", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="text-center">
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm inline-block">
          {error}
        </div>
      )}
      <button
        onClick={handleAccept}
        disabled={loading}
        className="bg-navy-dark text-white font-semibold px-8 py-3 rounded-xl hover:bg-navy transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? "Accepting…" : "Accept Agreement"}
      </button>
    </div>
  );
}
