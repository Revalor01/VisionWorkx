import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

// Shared top nav for every VisionWorkx /admin/* page -- extracted so a new
// admin page (e.g. /admin/modules) doesn't roll its own inline link list
// that drifts out of sync with this one (the exact drift revalor-admin's
// own AdminNavBar.tsx was written to fix for its side of the ecosystem).
//
// `extra` is a slot for a page-specific control (e.g. AdminDashboard's
// auto-refresh toggle) rendered before the shared links.
export function AdminHeader({ badge = "Admin", extra }: { badge?: string; extra?: ReactNode }) {
  return (
    <header className="bg-[#1A3A5C] text-white px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Image src="/VisionWorks.png" alt="VisionWorkx" width={32} height={32} className="h-8 w-8 rounded bg-white/90 object-contain p-0.5" />
        <Image
          src="/visionworkx-automation-logo.png"
          alt="VisionWorkx Automation"
          width={32}
          height={32}
          className="h-8 w-8 rounded bg-white/90 object-contain p-0.5"
        />
        <Image src="/sanctum-logo.png" alt="Sanctum" width={32} height={32} className="h-8 w-8 rounded bg-white/90 object-contain p-0.5" />
        <span className="text-lg font-bold tracking-tight">Vision Workx</span>
        <span className="text-xs bg-black/20 px-2 py-0.5 rounded-full font-medium">{badge}</span>
      </div>
      <div className="flex items-center gap-4 flex-wrap justify-end">
        {extra}
        <Link href="/admin/social" className="text-xs text-white/70 hover:text-white transition-colors">
          Social Media →
        </Link>
        <a
          href="https://revalor-admin.vercel.app/seo"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-white/70 hover:text-white transition-colors"
        >
          SEO →
        </a>
        <Link href="/admin/marketing" className="text-xs text-white/70 hover:text-white transition-colors">
          Marketing →
        </Link>
        <Link href="/admin/mobile" className="text-xs text-white/70 hover:text-white transition-colors">
          Mobile →
        </Link>
        <Link href="/admin/content" className="text-xs text-white/70 hover:text-white transition-colors">
          Content →
        </Link>
        <Link href="/admin/modules" className="text-xs text-white/70 hover:text-white transition-colors">
          Modules →
        </Link>
        <a href="https://revalor-admin.vercel.app/ops" className="text-xs text-white/70 hover:text-white transition-colors">
          Ops →
        </a>
        <a href="https://revalor-admin.vercel.app/dev-activity" className="text-xs text-white/70 hover:text-white transition-colors">
          Dev Activity →
        </a>
        <span className="hidden sm:inline text-white/20">|</span>
        <Link href="/dashboard" className="text-xs text-white/70 hover:text-white transition-colors">
          ← Back to Dashboard
        </Link>
      </div>
    </header>
  );
}

// The "Products" pill row -- jumps to another Revalor admin panel via the
// shared SSO ticket issuer. Same links AdminDashboard's Overview already
// used; just named and reusable now.
export function AdminProductPills() {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-6 pb-4 border-b border-zinc-200">
      <h2 className="text-sm font-bold text-white bg-[#1A3A5C] rounded-full px-4 py-1 w-28 text-center shrink-0">
        Products
      </h2>
      <a href="/api/admin/sso/issue?target=chorebit" className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-500 hover:border-zinc-400">
        Chorebit →
      </a>
      <a href="/api/admin/sso/issue?target=feelflow" className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-500 hover:border-zinc-400">
        FeelFlow →
      </a>
      <a href="/api/admin/sso/issue?target=mindbit" className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-500 hover:border-zinc-400">
        MindBit →
      </a>
      <a href="/api/admin/sso/issue?target=sanctum" className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-500 hover:border-zinc-400">
        Sanctum →
      </a>
      <a href="/api/admin/sso/issue?target=proactive" className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-500 hover:border-zinc-400">
        Proactive →
      </a>
      <a href="/api/admin/sso/issue?target=revalor" className="rounded-lg border border-[#B8860B]/50 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:border-[#B8860B] hover:bg-[#B8860B]/5">
        Revalor Admin →
      </a>
    </div>
  );
}
