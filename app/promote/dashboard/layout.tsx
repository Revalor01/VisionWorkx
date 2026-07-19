import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/social/authGuard";
import SignOutButton from "./SignOutButton";

const NAV_ITEMS = [
  { href: "/promote/dashboard", label: "Dashboard", icon: "🏠" },
  { href: "/promote/dashboard/creatives", label: "Ad Creatives", icon: "🖼️" },
  { href: "/promote/dashboard/campaigns", label: "Campaigns", icon: "📣" },
  { href: "/promote/dashboard/settings", label: "Settings", icon: "⚙️" },
];

export default async function PromoteDashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect("/login?next=/promote/dashboard");

  const { data: business } = await supabase
    .from("promote_businesses")
    .select("id, name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!business) redirect("/promote/onboarding");

  const { data: sub } = await supabase
    .from("promote_subscriptions")
    .select("plan, status")
    .eq("user_id", user.id)
    .maybeSingle();

  const activePlan = isAdmin(user)
    ? "pro"
    : sub?.status === "active" || sub?.status === "trialing"
      ? sub.plan
      : null;

  return (
    <div className="min-h-screen bg-promote-bg text-promote-text flex">
      <aside className="w-60 shrink-0 border-r border-promote-border flex flex-col">
        <div className="px-5 py-5 border-b border-promote-border">
          <span className="font-bold text-base">
            VisionWorkx <span className="text-promote-accent">Promote</span>
          </span>
          <p className="text-xs text-promote-muted mt-0.5">Revalor LLC</p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-promote-text hover:bg-promote-bg2 transition-colors"
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-promote-border">
          <p className="text-sm font-medium truncate">{business.name}</p>
          <p className="text-xs text-promote-muted mt-0.5">
            {activePlan ? (
              <span className="capitalize">{activePlan} plan</span>
            ) : (
              <Link href="/promote/dashboard/settings" className="text-promote-accent hover:underline">
                Upgrade →
              </Link>
            )}
          </p>
          <SignOutButton />
        </div>
      </aside>

      <main className="flex-1 min-w-0 px-8 py-8 overflow-y-auto">{children}</main>
    </div>
  );
}
