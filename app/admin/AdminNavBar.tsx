// Shared Media/Operations nav bar for VisionWorkx's growth-tool admin pages,
// mirroring revalor-admin's app/AdminNavBar.tsx (same categories, same pill
// style) so the two repos' bars read as one system even though nothing can
// actually be imported across separate deployments. /admin/ops and
// /admin/dev-activity look product-specific by name but are genuinely
// company-wide (Supabase/Vercel project state, the cross-machine dev-activity
// log) — revalor-admin's own /ops and /dev-activity are ports of the same
// data, so both copies are cross-linked as Operations, not Media.
type NavCategory = "media" | "operations";

type NavLink = { key: string; label: string; href: string };

const REVALOR_ADMIN = "https://revalor-admin.vercel.app";

const MEDIA_LINKS: NavLink[] = [
  { key: "social", label: "Social", href: "/admin/social" },
  { key: "marketing", label: "Email Marketing", href: "/admin/marketing" },
  { key: "mobile", label: "Mobile", href: "/admin/mobile" },
  { key: "content", label: "Content", href: "/admin/content" },
  { key: "seo", label: "SEO", href: `${REVALOR_ADMIN}/seo` },
  { key: "outreach", label: "Outreach", href: `${REVALOR_ADMIN}/outreach` },
  { key: "video", label: "Video", href: `${REVALOR_ADMIN}/video` },
  { key: "leads", label: "Leads", href: `${REVALOR_ADMIN}/leads` },
  { key: "messages", label: "Messages", href: `${REVALOR_ADMIN}/messages` },
];

const OPERATIONS_LINKS: NavLink[] = [
  { key: "vw-ops", label: "Ops", href: "/admin/ops" },
  { key: "vw-dev-activity", label: "Dev Activity", href: "/admin/dev-activity" },
  { key: "ops", label: "Ops (Revalor Admin)", href: `${REVALOR_ADMIN}/ops` },
  { key: "ai-usage", label: "AI Usage", href: `${REVALOR_ADMIN}/ai-usage` },
  { key: "dev-activity", label: "Dev Activity (Revalor Admin)", href: `${REVALOR_ADMIN}/dev-activity` },
  { key: "system-scan", label: "System Scan", href: `${REVALOR_ADMIN}/system-scan` },
  { key: "maintenance", label: "Maintenance", href: `${REVALOR_ADMIN}/maintenance` },
  { key: "supabase-costs", label: "Supabase Costs", href: `${REVALOR_ADMIN}/supabase-costs` },
];

export default function AdminNavBar({ category, current }: { category: NavCategory; current: string }) {
  const links = (category === "media" ? MEDIA_LINKS : OPERATIONS_LINKS).filter((l) => l.key !== current);
  const label = category === "media" ? "Media" : "Operations";

  return (
    <div className="flex flex-wrap items-center gap-3 mb-6 pb-4 border-b border-zinc-200">
      <h2 className="text-sm font-bold text-white bg-[#1A3A5C] rounded-full px-4 py-1 w-28 text-center shrink-0">
        {label}
      </h2>
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <a
            key={l.key}
            href={l.href}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-500 hover:border-zinc-400"
          >
            {l.label} →
          </a>
        ))}
        <a
          href={`${REVALOR_ADMIN}/`}
          className="rounded-lg border border-[#B8860B]/50 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:border-[#B8860B] hover:bg-[#B8860B]/5"
        >
          Revalor Admin →
        </a>
      </div>
    </div>
  );
}
