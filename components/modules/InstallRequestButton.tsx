"use client";

import { useState } from "react";

export default function InstallRequestButton({ slug, requested }: { slug: string; requested: boolean }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(requested ? "done" : "idle");
  if (state === "done") return <span className="text-sm text-emerald-700">Install requested — we&apos;ll email you within one business day.</span>;
  return (
    <button
      type="button"
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        const res = await fetch(`/api/workspace/${slug}/install-request`, { method: "POST" }).catch(() => null);
        setState(res?.ok ? "done" : "error");
      }}
      className="text-sm font-semibold text-navy hover:underline disabled:opacity-60"
    >
      {state === "busy" ? "Sending…" : state === "error" ? "Couldn't send — try again" : "Have Revalor install it"}
    </button>
  );
}
