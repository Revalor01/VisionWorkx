// The "Products" pill row -- jumps to another Revalor admin panel via the
// shared SSO ticket issuer. Shared by every VisionWorkx admin page.
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
