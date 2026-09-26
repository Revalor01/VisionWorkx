"use client";

import { useState } from "react";

const input =
  "mt-1.5 w-full rounded-xl border border-gray-300 px-4 py-3 text-base font-normal focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20";

export default function StartForm({ builders }: { builders: string[] }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: f.get("name"),
          email: f.get("email"),
          businessName: f.get("businessName"),
          website: f.get("website"),
          builder: f.get("builder"),
          terms: f.get("terms") === "on",
          company_url: f.get("company_url"),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
      setEmail(String(f.get("email") ?? ""));
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div role="status" className="py-6 text-center">
        <p className="mb-2 text-lg font-semibold text-navy-dark">Check your email</p>
        <p className="text-sm text-gray-600">
          We sent a sign-in link to <strong>{email}</strong>. Click it to finish setting up your workspace — it works once and
          expires in an hour.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-gray-700">
          Your name
          <input name="name" required maxLength={100} autoComplete="name" className={input} />
        </label>
        <label className="block text-sm font-semibold text-gray-700">
          Work email
          <input name="email" type="email" required maxLength={200} autoComplete="email" className={input} />
        </label>
      </div>
      <label className="block text-sm font-semibold text-gray-700">
        Business name
        <input name="businessName" required maxLength={100} autoComplete="organization" className={input} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-gray-700">
          Website <span className="font-normal text-gray-500">(optional)</span>
          <input name="website" maxLength={200} placeholder="yourbusiness.com" autoComplete="url" className={input} />
        </label>
        <label className="block text-sm font-semibold text-gray-700">
          Built with
          <select name="builder" defaultValue="" className={input}>
            <option value="">Choose…</option>
            {builders.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
      </div>
      {/* Honeypot — hidden from people, tempting to bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Company URL
          <input name="company_url" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="flex items-start gap-3 text-sm text-gray-600">
        <input name="terms" type="checkbox" required className="mt-1 h-4 w-4 rounded border-gray-300" />
        <span>
          I agree to the{" "}
          <a href="/terms" target="_blank" className="font-semibold text-navy hover:underline">Terms of Service</a> and{" "}
          <a href="/privacy" target="_blank" className="font-semibold text-navy hover:underline">Privacy Policy</a>.
        </span>
      </label>
      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full rounded-xl bg-navy-dark py-3 font-semibold text-white hover:bg-navy disabled:opacity-60"
      >
        {status === "sending" ? "Creating your workspace…" : "Create my workspace"}
      </button>
      {status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
