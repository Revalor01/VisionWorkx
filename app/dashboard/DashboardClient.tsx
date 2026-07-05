"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppNavbar from "@/components/nav/AppNavbar";
import { createBrowserClient } from "@/lib/supabase-browser";
import type { App, AppCategory, AppStatus, Plan } from "@/lib/database.types";

// ── Constants ───────────────────────────────────────────────────

const PLAN_APP_LIMITS: Record<Plan, number> = {
  free: 1, // 1 app during trial
  starter: 1,
  growth: 3,
  pro: Infinity,
};

const CATEGORY_ICONS: Record<AppCategory, string> = {
  booking: "📅",
  crm: "👥",
  inventory: "📦",
  portal: "🔐",
  invoicing: "🧾",
  membership: "🎫",
};

const CATEGORY_LABELS: Record<AppCategory, string> = {
  booking: "Booking & Scheduling",
  crm: "Customer CRM",
  inventory: "Inventory & Orders",
  portal: "Customer Portal",
  invoicing: "Invoicing & Quotes",
  membership: "Membership Management",
};

const STATUS_CONFIG: Record<
  AppStatus,
  { label: string; cls: string; dot: string }
> = {
  generating: {
    label: "Generating",
    cls: "bg-amber-100 text-amber-700",
    dot: "bg-amber-400 animate-pulse",
  },
  ready: {
    label: "Queued",
    cls: "bg-blue-100 text-blue-700",
    dot: "bg-blue-400 animate-pulse",
  },
  deploying: {
    label: "Deploying",
    cls: "bg-blue-100 text-blue-700",
    dot: "bg-blue-400 animate-pulse",
  },
  deployed: {
    label: "Live",
    cls: "bg-green-100 text-green-700",
    dot: "bg-green-400",
  },
  failed: {
    label: "Failed",
    cls: "bg-red-100 text-red-700",
    dot: "bg-red-400",
  },
  deploy_failed: {
    label: "Deploy Failed",
    cls: "bg-red-100 text-red-700",
    dot: "bg-red-400",
  },
};

// ── Types ───────────────────────────────────────────────────────

interface DashboardClientProps {
  userId: string;
  userEmail: string | null;
  profile: {
    plan: Plan;
    fullName: string | null;
    companyName: string | null;
    createdAt: string;
  };
  initialApps: App[];
}

// ── Component ───────────────────────────────────────────────────

export default function DashboardClient({
  userId,
  userEmail,
  profile,
  initialApps,
}: DashboardClientProps) {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [apps, setApps] = useState<App[]>(initialApps);
  const [pollCount, setPollCount] = useState(0);

  const limit = PLAN_APP_LIMITS[profile.plan];
  const appsUsed = apps.length;
  const atLimit = limit !== Infinity && appsUsed >= limit;
  const hasGenerating = apps.some(
    (a) => a.status === "generating" || a.status === "ready" || a.status === "deploying"
  );

  // Poll every 5s while any app is generating
  useEffect(() => {
    if (!hasGenerating) return;

    let active = true;

    const interval = setInterval(async () => {
      const { data } = await supabase
        .from("apps")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (data && active) {
        setApps(data as App[]);
        setPollCount((n) => n + 1);
      }
    }, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [hasGenerating, supabase, userId]);

  const firstName = profile.fullName?.split(" ")[0] ?? null;
  const greeting = firstName ? `Welcome back, ${firstName}` : "Welcome back";

  return (
    <div className="min-h-screen bg-off-white flex flex-col">
      <AppNavbar userName={profile.fullName} plan={profile.plan} userEmail={userEmail} />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-navy-dark">{greeting}</h1>
            {profile.companyName && (
              <p className="text-sm text-gray-500 mt-0.5">{profile.companyName}</p>
            )}
          </div>

          {atLimit ? (
            <Link
              href="/billing"
              className="inline-flex items-center gap-2 bg-navy text-white font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-blue-700 transition-colors"
            >
              ↑ Upgrade to Add More Apps
            </Link>
          ) : (
            <Link
              href="/onboard"
              className="inline-flex items-center gap-2 bg-navy-dark text-white font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-navy transition-colors"
            >
              <span className="text-base leading-none">+</span> Create New App
            </Link>
          )}
        </div>

        {/* ── Usage bar ── */}
        {limit !== Infinity && (
          <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-8">
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-sm font-semibold text-navy-dark">Apps used</p>
              <p className="text-sm text-gray-500">
                {appsUsed} / {limit}
              </p>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all duration-500 ${
                  atLimit ? "bg-amber-500" : "bg-navy-dark"
                }`}
                style={{
                  width: `${Math.min((appsUsed / limit) * 100, 100)}%`,
                }}
              />
            </div>
            {atLimit && (
              <p className="text-xs text-amber-700 mt-2">
                You&apos;ve reached your {profile.plan} plan limit.{" "}
                <Link href="/billing" className="font-semibold underline">
                  Upgrade
                </Link>{" "}
                to create more apps.
              </p>
            )}
          </div>
        )}

        {/* ── Polling indicator ── */}
        {hasGenerating && (
          <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-6">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
            <span>
              {apps.some((a) => a.status === "deploying")
                ? "Deploying to Vercel — checking for updates every 5 seconds…"
                : "Generating your app — checking for updates every 5 seconds…"}
              {pollCount > 0 && (
                <span className="text-blue-400 ml-1">
                  (refreshed {pollCount} time{pollCount !== 1 ? "s" : ""})
                </span>
              )}
            </span>
          </div>
        )}

        {/* ── App grid / empty state ── */}
        {apps.length === 0 ? (
          <EmptyState plan={profile.plan} atLimit={atLimit} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {apps.map((app) => (
              <AppCard key={app.id} app={app} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

// ── App Card ────────────────────────────────────────────────────

function AppCard({ app }: { app: App }) {
  const status = STATUS_CONFIG[app.status] ?? STATUS_CONFIG.failed;
  const icon = CATEGORY_ICONS[app.category] ?? "🛠️";
  const categoryLabel = CATEGORY_LABELS[app.category] ?? app.category;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col hover:shadow-md transition-shadow">
      {/* Top row */}
      <div className="flex items-start justify-between mb-4">
        <span className="text-3xl">{icon}</span>
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${status.cls}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${status.dot}`} />
          {status.label}
        </span>
      </div>

      {/* App info */}
      <h3 className="font-bold text-navy-dark text-base leading-snug mb-1">
        {app.name}
      </h3>
      <p className="text-xs text-gray-500 mb-1">{categoryLabel}</p>
      <p className="text-xs text-gray-400 mb-4">
        Created {new Date(app.created_at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </p>

      {/* Status-specific inline message */}
      {app.status === "generating" && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2 mb-4">
          <span className="animate-spin text-sm">⚙️</span>
          Building your app — check back shortly.
        </div>
      )}

      {(app.status === "ready" || app.status === "deploying") && (
        <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 rounded-xl px-3 py-2 mb-4">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
          Deploying to Vercel — your app will be live shortly.
        </div>
      )}

      {app.status === "deploy_failed" && (
        <div className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-4">
          Deployment failed. Please contact support or try again.
        </div>
      )}

      {app.status === "failed" && (
        <div className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2 mb-4">
          Generation failed.{" "}
          <Link
            href={`/generate?appId=${app.id}`}
            className="font-semibold underline"
          >
            Try again →
          </Link>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-auto flex gap-2">
        {app.status === "deployed" && app.deploy_url && (
          <a
            href={app.deploy_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center text-xs font-semibold bg-navy-dark text-white py-2.5 rounded-xl hover:bg-navy transition-colors"
          >
            View App ↗
          </a>
        )}

        {(app.status === "ready" || app.status === "deploying") && (
          <span className="flex-1 text-center text-xs font-medium text-blue-500 bg-blue-50 py-2.5 rounded-xl">
            Deploying…
          </span>
        )}

        {app.status === "generating" && (
          <Link
            href={`/generate?appId=${app.id}`}
            className="flex-1 text-center text-xs font-medium text-amber-700 bg-amber-50 py-2.5 rounded-xl hover:bg-amber-100 transition-colors"
          >
            View Progress →
          </Link>
        )}

        <Link
          href={`/onboard?edit=${app.id}`}
          className="flex-1 text-center text-xs font-semibold border border-gray-200 text-gray-700 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
        >
          Edit
        </Link>
      </div>
    </div>
  );
}

// ── Empty state ─────────────────────────────────────────────────

function EmptyState({
  plan,
  atLimit,
}: {
  plan: Plan;
  atLimit: boolean;
}) {
  return (
    <div className="text-center py-20 px-4">
      <div className="text-6xl mb-5">🚀</div>
      <h2 className="text-xl font-bold text-navy-dark mb-2">
        No apps yet
      </h2>
      <p className="text-gray-500 text-sm max-w-sm mx-auto mb-8 leading-relaxed">
        Describe the app your business needs and we&apos;ll build it in
        minutes — no code required.
      </p>

      {atLimit ? (
        <div className="space-y-3">
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 inline-block">
            You&apos;ve reached your {plan} plan limit.
          </p>
          <div>
            <Link
              href="/billing"
              className="inline-block bg-navy-dark text-white font-semibold px-8 py-3 rounded-xl hover:bg-navy transition-colors"
            >
              Upgrade Your Plan
            </Link>
          </div>
        </div>
      ) : (
        <Link
          href="/onboard"
          className="inline-block bg-navy-dark text-white font-semibold px-8 py-3 rounded-xl hover:bg-navy transition-colors"
        >
          Create Your First App →
        </Link>
      )}

      {/* Category preview */}
      <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-lg mx-auto">
        {(Object.entries(CATEGORY_ICONS) as [AppCategory, string][]).map(
          ([cat, icon]) => (
            <div
              key={cat}
              className="bg-white border border-gray-100 rounded-xl p-3 text-center"
            >
              <div className="text-2xl mb-1">{icon}</div>
              <p className="text-xs text-gray-500 leading-tight">
                {CATEGORY_LABELS[cat]}
              </p>
            </div>
          )
        )}
      </div>
    </div>
  );
}
