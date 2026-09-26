"use client";

import { useState } from "react";

export default function CopyButton({ text, label = "Copy snippet" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState("copied");
        } catch {
          setState("failed");
        }
        setTimeout(() => setState("idle"), 2000);
      }}
      className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-gray-100"
    >
      {state === "copied" ? "Copied ✓" : state === "failed" ? "Select and copy manually" : label}
    </button>
  );
}
