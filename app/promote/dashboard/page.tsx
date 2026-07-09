import Link from "next/link";
import { createServerClient } from "@/lib/supabase";

export default async function PromoteDashboardHome() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: business } = await supabase
    .from("promote_businesses")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  const businessId = business?.id ?? "";

  const [{ data: campaigns }, { data: creatives }] = await Promise.all([
    supabase.from("promote_campaigns").select("*").eq("business_id", businessId),
    supabase
      .from("promote_creatives")
      .select("*")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .limit(4),
  ]);

  const activeCampaigns = (campaigns ?? []).filter((c) => c.status === "pending_platform_approval" || c.status === "paused").length;
  const totalSpend = (campaigns ?? []).reduce((sum, c) => sum + Number(c.total_spend), 0);
  const totalClicks = (campaigns ?? []).reduce((sum, c) => sum + c.clicks, 0);
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
      <p className="text-promote-muted text-sm mb-8">Real-time stats will populate once campaigns are live on Meta/Google.</p>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Active Campaigns" value={String(activeCampaigns)} />
        <StatCard label="Spend This Month" value={`$${totalSpend.toFixed(2)}`} />
        <StatCard label="Clicks This Month" value={String(totalClicks)} />
        <StatCard label="Avg. CPC" value={`$${avgCpc.toFixed(2)}`} />
      </div>

      <div className="flex gap-3 mb-8">
        <Link href="/promote/dashboard/creatives" className="px-5 py-3 rounded-xl bg-promote-accent text-white text-sm font-semibold hover:opacity-90 transition-opacity">
          + Generate New Ad
        </Link>
        <Link href="/promote/dashboard/campaigns" className="px-5 py-3 rounded-xl border border-promote-border text-sm font-semibold hover:bg-promote-bg2 transition-colors">
          Launch Campaign
        </Link>
      </div>

      <h2 className="text-lg font-semibold mb-4">Recent Creatives</h2>
      {creatives && creatives.length > 0 ? (
        <div className="grid grid-cols-4 gap-4">
          {creatives.map((c) => (
            <div key={c.id} className="bg-promote-bg2 border border-promote-border rounded-xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.image_url} alt={c.headline} className="w-full aspect-square object-cover" />
              <div className="p-3">
                <p className="text-sm font-medium truncate">{c.headline}</p>
                <StatusBadge status={c.status} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-promote-bg2 border border-dashed border-promote-border rounded-xl p-10 text-center text-promote-muted text-sm">
          No creatives yet. <Link href="/promote/dashboard/creatives" className="text-promote-accent hover:underline">Generate your first ad</Link>.
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-promote-bg2 border border-promote-border rounded-xl p-5">
      <p className="text-xs text-promote-muted uppercase tracking-wide mb-2">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-promote-muted/20 text-promote-muted",
    approved: "bg-promote-green/20 text-promote-green",
    archived: "bg-promote-border text-promote-muted",
  };
  return (
    <span className={`inline-block mt-1.5 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${styles[status] ?? styles.draft}`}>
      {status}
    </span>
  );
}
