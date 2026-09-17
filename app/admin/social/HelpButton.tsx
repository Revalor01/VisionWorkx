"use client";

import { useState } from "react";

// Small "?" button that opens a modal of page-specific instructions —
// one per tab (Brands/Video/Studio/LinkedIn), next to that tab's own
// heading, rather than the single all-in-one Help tab in the main nav.
export default function HelpButton({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-6 h-6 rounded-full border border-slate-300 text-slate-500 text-xs font-semibold hover:border-[#1A3A5C] hover:text-[#1A3A5C] transition-colors flex items-center justify-center shrink-0"
        title="Help"
        aria-label="Help"
      >
        ?
      </button>
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl max-w-lg w-full my-8 p-6 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-[#1A3A5C] pr-4">{title}</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none shrink-0"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="space-y-4 text-sm text-slate-700">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}

export function HelpSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div>
      {title && <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">{title}</h4>}
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export function HelpStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#1A3A5C] text-white text-xs font-semibold flex items-center justify-center mt-0.5">
        {n}
      </span>
      <p>{children}</p>
    </div>
  );
}

export function HelpNote({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2.5">{children}</p>;
}
