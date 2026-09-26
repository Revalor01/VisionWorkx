"use client";

import { useState } from "react";
import { modulesBrowserClient } from "@/lib/modules/supabase-browser";

export default function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    const supabase = modulesBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: false, // accounts are created by Revalor when a workspace is set up
        emailRedirectTo: `${window.location.origin}/workspace/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setStatus("error");
      setError(
        /signups? not allowed|not found/i.test(error.message)
          ? "We couldn't find a workspace login for that email. Ask your Revalor contact to invite you."
          : "We couldn't send the link just now. Please try again in a minute.",
      );
      return;
    }
    setStatus("sent");
  }

  if (status === "sent") {
    return (
      <div role="status" className="text-center">
        <p className="text-lg font-semibold text-navy-dark mb-2">Check your email</p>
        <p className="text-gray-600 text-sm">
          We sent a sign-in link to <strong>{email}</strong>. It works once and expires in an hour.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label htmlFor="ws-email" className="block text-sm font-semibold text-gray-700">
        Work email
        <input
          id="ws-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-gray-300 px-4 py-3 text-base font-normal focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20"
        />
      </label>
      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full rounded-xl bg-navy-dark py-3 font-semibold text-white hover:bg-navy disabled:opacity-60"
      >
        {status === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>
      {status === "error" && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
