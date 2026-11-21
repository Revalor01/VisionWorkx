"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { REVALOR_ADMIN, sectionForPath, type RevalorNav } from "@/lib/revalorNav";

// The Revalor admin top bar on every VisionWorkx /admin page — the same bar as
// revalor-admin's app/AdminTopBar.tsx, drawn from the nav it serves at
// /api/nav (lib/revalorNav.ts), so the two never drift.
//   Row 1: Revalor Admin wordmark · ← Revalor Admin + this page's section and
//          its sibling pages as colour-coded pills · bell (revalor-admin's
//          needs-attention list).
//   Row 2: the section dropdowns (A–Z, with flyout tabs) │ Quick Access.
// Search and the Steve menu stay on revalor-admin: they read its own data.

const TOP_PILL = "shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-bold text-white shadow-sm transition-[filter] hover:brightness-110";

const isExternal = (href: string) => /^https?:/.test(href) && !href.startsWith(REVALOR_ADMIN);
const newTab = (href: string) => (isExternal(href) ? { target: "_blank", rel: "noopener noreferrer" } : {});

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export default function RevalorTopBar({ nav }: { nav: RevalorNav }) {
  const pathname = usePathname() ?? "/admin";
  const section = sectionForPath(nav, pathname);
  const [open, setOpen] = useState<string | null>(null);
  const barRef = useRef<HTMLElement>(null);

  // Close an open dropdown on an outside click or Escape.
  useEffect(() => {
    if (open === null) return;
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header ref={barRef} className="revalor-top-bar print:hidden sticky top-0 z-40 border-b border-[#102a44] bg-[#1A3A5C] text-white">
      {/* Row 1 */}
      <div className="flex items-center gap-4 px-4 py-2 sm:px-6 lg:px-8">
        <a href={`${REVALOR_ADMIN}/`} className="flex shrink-0 items-center" aria-label="Revalor Admin home">
          <Image src="/revalor-admin-wordmark.png" alt="Revalor Admin" width={900} height={139} priority className="h-5 w-auto sm:h-6" />
        </a>

        <nav aria-label="This page" className="ml-1 flex min-w-0 flex-wrap items-center gap-1.5">
          <a
            href={`${REVALOR_ADMIN}/`}
            className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold text-white transition-colors hover:bg-white/10"
            style={{ boxShadow: "inset 0 0 0 1.5px #B8860B" }}
          >
            ← Revalor Admin
          </a>
          {section && (
            <>
              <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white" style={{ background: section.category.hex }}>
                {section.category.label}
              </span>
              {section.category.links.map((l) => {
                const hex = section.category.hex;
                const here = l.key === section.current;
                return (
                  <a
                    key={l.key}
                    href={l.href}
                    aria-current={here ? "page" : undefined}
                    {...newTab(l.href)}
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white transition-[filter] hover:brightness-125 ${here ? "" : "opacity-90"}`}
                    style={here ? { background: hex, boxShadow: "inset 0 0 0 1.5px #fff" } : { background: `${hex}40`, boxShadow: `inset 0 0 0 1px ${hex}` }}
                  >
                    {l.label}
                  </a>
                );
              })}
            </>
          )}
        </nav>

        <div className="ml-auto flex shrink-0 items-center">
          <a
            href={`${REVALOR_ADMIN}/#needs-attention`}
            className="grid h-8 w-8 place-items-center rounded-lg border border-white/15 text-white/80 transition-colors hover:border-white/30 hover:text-white"
            aria-label="Needs attention (Revalor Admin)"
          >
            <BellIcon />
          </a>
        </div>
      </div>

      {/* Row 2: section dropdowns │ Quick Access */}
      <nav className="flex flex-wrap items-center gap-1 border-t border-white/10 bg-[#163351] px-3 py-1.5" aria-label="Sections">
        {nav.categories.map((cat) => {
          const isOpen = open === cat.key;
          return (
            <div key={cat.key} className="relative">
              <button
                type="button"
                onClick={() => setOpen((cur) => (cur === cat.key ? null : cat.key))}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                className={`flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-semibold transition-colors ${
                  isOpen ? "bg-white text-[#1A3A5C]" : "text-white/85 hover:bg-white/10"
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: cat.hex }} aria-hidden />
                {cat.label}
              </button>
              {isOpen && (
                <div role="menu" className="absolute left-0 z-50 mt-1.5 w-60 rounded-xl border border-zinc-200 bg-white py-1 shadow-xl" style={{ borderTop: `3px solid ${cat.hex}` }}>
                  {cat.links.map((l) => {
                    const item = (
                      <a
                        key={l.key}
                        href={l.href}
                        role="menuitem"
                        {...newTab(l.href)}
                        className="flex items-center justify-between px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 group-hover/sub:bg-zinc-50"
                        onClick={() => setOpen(null)}
                      >
                        {l.label}
                        {l.sub && <span className="text-zinc-400" aria-hidden>▸</span>}
                      </a>
                    );
                    if (!l.sub) return item;
                    return (
                      <div key={l.key} className="group/sub relative">
                        {item}
                        <div className="invisible absolute left-full top-0 z-50 -mt-1 pl-1 opacity-0 transition-opacity group-hover/sub:visible group-hover/sub:opacity-100 group-focus-within/sub:visible group-focus-within/sub:opacity-100">
                          <div role="menu" aria-label={`${l.label} tabs`} className="w-52 rounded-xl border border-zinc-200 bg-white py-1 shadow-xl" style={{ borderTop: `3px solid ${cat.hex}` }}>
                            {l.sub.map((s) => (
                              <a key={s.key} href={s.href} role="menuitem" {...newTab(s.href)} className="block px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50" onClick={() => setOpen(null)}>
                                {s.label}
                              </a>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {nav.quick.length > 0 && (
          <>
            <span className="mx-1 h-5 w-px shrink-0 bg-white/30" aria-hidden />
            <span className="shrink-0 pr-1 text-[11px] font-semibold text-white/50">Quick Access</span>
            {[nav.quick.filter((q) => q.row !== 2), nav.quick.filter((q) => q.row === 2)].map((line, n) => (
              <div key={n} className="contents">
                {n === 1 && line.length > 0 && <span className="mx-1 h-5 w-px shrink-0 bg-white/30" aria-hidden />}
                {line.map((q) => (
                  <a
                    key={q.key}
                    href={q.href}
                    {...(q.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className={TOP_PILL}
                    style={{ background: q.color, ...(q.ring ? { boxShadow: `inset 0 0 0 2px ${q.ring}` } : {}) }}
                  >
                    {q.label}
                  </a>
                ))}
              </div>
            ))}
          </>
        )}
      </nav>
    </header>
  );
}
