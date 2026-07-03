"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function HeroEmailForm() {
  const [email, setEmail] = useState("");
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/signup${email ? `?email=${encodeURIComponent(email)}` : ""}`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@yourbusiness.com"
        className="flex-1 min-w-0 bg-white/10 border border-blue-500/50 text-white placeholder-blue-300/70 rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent backdrop-blur-sm"
        required
      />
      <button
        type="submit"
        className="shrink-0 bg-navy hover:bg-blue-500 text-white font-semibold px-6 py-3.5 rounded-xl text-sm transition-colors whitespace-nowrap shadow-lg shadow-blue-900/40"
      >
        Start Building Free →
      </button>
    </form>
  );
}
