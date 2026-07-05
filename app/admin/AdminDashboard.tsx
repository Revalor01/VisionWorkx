"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { App, AppCategory, AppStatus, Plan, Profile, Subscription } from "@/lib/database.types";
import type { PaymentRow } from "@/app/api/admin/payments/route";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdminDashboardProps {
  apps: Pick<App, "id" | "user_id" | "name" | "category" | "status" | "deploy_url" | "created_at" | "intake_data">[];
  profiles: Pick<Profile, "id" | "full_name" | "company_name" | "plan" | "created_at">[];
  subscriptions: Pick<Subscription, "user_id" | "plan" | "status" | "current_period_end" | "stripe_subscription_id">[];
  userEmails: Record<string, string>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PLAN_MRR: Record<string, number> = {
  starter: 49,
  growth: 99,
  pro: 199,
};

const CATEGORY_ICONS: Record<AppCategory, string> = {
  booking: "📅",
  crm: "👥",
  inventory: "📦",
  portal: "🔐",
};

const STATUS_STYLE: Record<AppStatus, { label: string; cls: string }> = {
  generating: { label: "Generating", cls: "bg-amber-100 text-amber-700" },
  ready:      { label: "Queued",     cls: "bg-sky-100 text-sky-700" },
  deploying:  { label: "Deploying",  cls: "bg-blue-100 text-blue-700" },
  deployed:   { label: "Live",       cls: "bg-green-100 text-green-700" },
  failed:     { label: "Failed",     cls: "bg-red-100 text-red-700" },
  deploy_failed: { label: "Deploy Failed", cls: "bg-red-100 text-red-700" },
};

const PLAN_STYLE: Record<Plan, string> = {
  free:     "bg-gray-100 text-gray-600",
  starter:  "bg-sky-100 text-sky-700",
  growth:   "bg-violet-100 text-violet-700",
  pro:      "bg-amber-100 text-amber-700",
};

type Tab = "overview" | "apps" | "users" | "payments";

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminDashboard({
  apps,
  profiles,
  subscriptions,
  userEmails,
}: AdminDashboardProps) {
  const router = useRouter();
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [appSearch, setAppSearch] = useState("");
  const [appStatusFilter, setAppStatusFilter] = useState<AppStatus | "all">("all");
  const [userSearch, setUserSearch] = useState("");
  const [redeploying, setRedeploying] = useState<Record<string, boolean>>({});
  const [redeployMessages, setRedeployMessages] = useState<Record<string, string>>({});
  const [deletingUsers, setDeletingUsers] = useState<Record<string, boolean>>({});
  const [deletedUserIds, setDeletedUserIds] = useState<Set<string>>(new Set());
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({});
  const [grantingBeta, setGrantingBeta] = useState<Record<string, boolean>>({});
  const [grantedBetaIds, setGrantedBetaIds] = useState<Set<string>>(new Set());
  const [grantErrors, setGrantErrors] = useState<Record<string, string>>({});

  // ── Payments state ─────────────────────────────────────────────
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentStats, setPaymentStats] = useState<{ totalRevenue: number; failedCount: number } | null>(null);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState("");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<PaymentRow["status"] | "all">("all");

  // Auto-refresh — re-runs the server-side data fetch on an interval without
  // a full page reload, so the active tab and filters stay put.
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, router]);

  useEffect(() => {
    if (tab !== "payments" || payments.length > 0) return;
    setPaymentsLoading(true);
    fetch("/api/admin/payments")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setPaymentsError(d.error); return; }
        setPayments(d.rows ?? []);
        setPaymentStats({ totalRevenue: d.totalRevenue, failedCount: d.failedCount });
      })
      .catch(() => setPaymentsError("Failed to load payments"))
      .finally(() => setPaymentsLoading(false));
  }, [tab, payments.length]);

  // ── Stats ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const liveApps = apps.filter((a) => a.status === "deployed").length;
    const activeSubs = subscriptions.filter((s) => s.status === "active" || s.status === "trialing");
    const mrr = activeSubs.reduce((sum, s) => sum + (PLAN_MRR[s.plan ?? ""] ?? 0), 0);
    const appsThisWeek = apps.filter(
      (a) => Date.now() - new Date(a.created_at).getTime() < 7 * 86400000
    ).length;

    return {
      totalUsers: profiles.length,
      totalApps: apps.length,
      liveApps,
      mrr,
      appsThisWeek,
      generating: apps.filter((a) => a.status === "generating").length,
      deploying: apps.filter((a) => a.status === "deploying" || a.status === "ready").length,
      failed: apps.filter((a) => a.status === "failed" || a.status === "deploy_failed").length,
    };
  }, [apps, profiles, subscriptions]);

  // ── Filtered apps ──────────────────────────────────────────────
  const filteredApps = useMemo(() => {
    const q = appSearch.toLowerCase();
    return apps.filter((a) => {
      const email = userEmails[a.user_id] ?? "";
      const matchesSearch =
        !q ||
        a.name.toLowerCase().includes(q) ||
        email.toLowerCase().includes(q) ||
        a.category.includes(q);
      const matchesStatus = appStatusFilter === "all" || a.status === appStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [apps, appSearch, appStatusFilter, userEmails]);

  // ── Filtered users ─────────────────────────────────────────────
  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase();
    return profiles
      .filter((p) => !deletedUserIds.has(p.id))
      .map((p) => ({
        ...p,
        email: userEmails[p.id] ?? "",
        appCount: apps.filter((a) => a.user_id === p.id).length,
        liveCount: apps.filter((a) => a.user_id === p.id && a.status === "deployed").length,
        sub: subscriptions.find((s) => s.user_id === p.id),
      }))
      .filter(
        (u) =>
          !q ||
          u.email.toLowerCase().includes(q) ||
          (u.full_name ?? "").toLowerCase().includes(q) ||
          (u.company_name ?? "").toLowerCase().includes(q)
      );
  }, [profiles, userSearch, userEmails, apps, subscriptions, deletedUserIds]);

  // ── Redeploy action ────────────────────────────────────────────
  async function handleRedeploy(appId: string) {
    setRedeploying((r) => ({ ...r, [appId]: true }));
    setRedeployMessages((m) => ({ ...m, [appId]: "Triggering…" }));
    try {
      const res = await fetch("/api/admin/redeploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId }),
      });
      const data = await res.json();
      if (res.ok) {
        setRedeployMessages((m) => ({ ...m, [appId]: "Deploy queued ✓" }));
      } else {
        setRedeployMessages((m) => ({ ...m, [appId]: data.error ?? "Failed" }));
      }
    } catch {
      setRedeployMessages((m) => ({ ...m, [appId]: "Network error" }));
    } finally {
      setRedeploying((r) => ({ ...r, [appId]: false }));
    }
  }

  // ── Delete user action ─────────────────────────────────────────
  async function handleDeleteUser(userId: string, email: string) {
    const confirmed = window.confirm(
      `Permanently delete ${email || userId}?\n\nThis removes their account, apps, and subscription record from Vision Workx. It does NOT cancel any live Stripe subscription or tear down their deployed Vercel projects — do that separately first if needed.\n\nThis cannot be undone.`
    );
    if (!confirmed) return;

    setDeletingUsers((d) => ({ ...d, [userId]: true }));
    setDeleteErrors((e) => ({ ...e, [userId]: "" }));
    try {
      const res = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (res.ok) {
        setDeletedUserIds((ids) => new Set(ids).add(userId));
      } else {
        setDeleteErrors((e) => ({ ...e, [userId]: data.error ?? "Failed" }));
      }
    } catch {
      setDeleteErrors((e) => ({ ...e, [userId]: "Network error" }));
    } finally {
      setDeletingUsers((d) => ({ ...d, [userId]: false }));
    }
  }

  // ── Grant beta access action ────────────────────────────────────
  async function handleGrantBetaAccess(userId: string, email: string) {
    const confirmed = window.confirm(
      `Grant free beta access to ${email || userId}?\n\nThis gives them unlimited apps and no trial expiry, with no real Stripe subscription or charge behind it — for beta testers, not paying customers.`
    );
    if (!confirmed) return;

    setGrantingBeta((g) => ({ ...g, [userId]: true }));
    setGrantErrors((e) => ({ ...e, [userId]: "" }));
    try {
      const res = await fetch("/api/admin/grant-beta-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (res.ok) {
        setGrantedBetaIds((ids) => new Set(ids).add(userId));
        router.refresh(); // re-fetch server data so Plan/Sub Status columns stop showing stale values
      } else {
        setGrantErrors((e) => ({ ...e, [userId]: data.error ?? "Failed" }));
      }
    } catch {
      setGrantErrors((e) => ({ ...e, [userId]: "Network error" }));
    } finally {
      setGrantingBeta((g) => ({ ...g, [userId]: false }));
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header */}
      <header className="bg-[#1A3A5C] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tracking-tight">Vision Workx</span>
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-medium">Admin</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
              autoRefresh ? "bg-green-500/20 text-green-300" : "bg-white/10 text-white/70 hover:text-white"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? "bg-green-400 animate-pulse" : "bg-white/40"}`} />
            Auto-refresh {autoRefresh ? "on" : "off"}
          </button>
          <Link href="/dashboard" className="text-xs text-white/70 hover:text-white transition-colors">
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* Page title */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#1A3A5C]">Management Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">All customers, apps, and deployments across Vision Workx</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white border border-gray-200 rounded-xl p-1 w-full sm:w-fit overflow-x-auto">
          {(["overview", "apps", "users", "payments"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 sm:px-5 py-2 rounded-lg text-sm font-medium capitalize transition-colors shrink-0 ${
                tab === t
                  ? "bg-[#1A3A5C] text-white"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {tab === "overview" && (
          <div className="space-y-6">
            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Total Users" value={stats.totalUsers} />
              <StatCard label="Total Apps" value={stats.totalApps} sub={`${stats.appsThisWeek} this week`} />
              <StatCard label="Live Apps" value={stats.liveApps} accent="green" />
              <StatCard label="Est. MRR" value={`$${stats.mrr.toLocaleString()}`} accent="blue" />
            </div>

            {/* Status breakdown */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">App Pipeline Status</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <PipelineStat label="Generating" count={stats.generating} color="amber" />
                <PipelineStat label="Deploying" count={stats.deploying} color="blue" />
                <PipelineStat label="Live" count={stats.liveApps} color="green" />
                <PipelineStat label="Failed" count={stats.failed} color="red" />
              </div>
            </div>

            {/* Recent apps */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">Recent Apps</h2>
                <button onClick={() => setTab("apps")} className="text-xs text-[#2E6DA4] hover:underline">
                  View all →
                </button>
              </div>
              <AppTable
                apps={apps.slice(0, 10)}
                userEmails={userEmails}
                redeploying={redeploying}
                redeployMessages={redeployMessages}
                onRedeploy={handleRedeploy}
              />
            </div>
          </div>
        )}

        {/* ── Apps ── */}
        {tab === "apps" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="Search apps, users, categories…"
                value={appSearch}
                onChange={(e) => setAppSearch(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20"
              />
              <select
                value={appStatusFilter}
                onChange={(e) => setAppStatusFilter(e.target.value as AppStatus | "all")}
                className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20 bg-white"
              >
                <option value="all">All statuses</option>
                {(Object.keys(STATUS_STYLE) as AppStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_STYLE[s].label}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-gray-400">{filteredApps.length} app{filteredApps.length !== 1 ? "s" : ""}</p>
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <AppTable
                apps={filteredApps}
                userEmails={userEmails}
                redeploying={redeploying}
                redeployMessages={redeployMessages}
                onRedeploy={handleRedeploy}
              />
            </div>
          </div>
        )}

        {/* ── Users ── */}
        {tab === "users" && (
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Search by email, name, company…"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="w-full sm:w-96 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20"
            />
            <p className="text-xs text-gray-400">{filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""}</p>
            <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <Th>User</Th>
                    <Th>Plan</Th>
                    <Th>Apps</Th>
                    <Th>Sub Status</Th>
                    <Th>Renews</Th>
                    <Th>Joined</Th>
                    <Th>&nbsp;</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-gray-400">
                        No users found
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{u.email || "—"}</div>
                          {(u.full_name || u.company_name) && (
                            <div className="text-xs text-gray-400">
                              {[u.full_name, u.company_name].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${PLAN_STYLE[u.plan]}`}>
                            {u.plan}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-gray-900 font-medium">{u.appCount}</span>
                          {u.liveCount > 0 && (
                            <span className="ml-1.5 text-xs text-green-600">({u.liveCount} live)</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {u.sub ? (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              u.sub.status === "active" ? "bg-green-100 text-green-700" :
                              u.sub.status === "trialing" ? "bg-sky-100 text-sky-700" :
                              u.sub.status === "past_due" ? "bg-red-100 text-red-700" :
                              "bg-gray-100 text-gray-500"
                            }`}>
                              {u.sub.status}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">No subscription</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {u.sub?.current_period_end
                            ? new Date(u.sub.current_period_end).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-3">
                            {grantedBetaIds.has(u.id) || (u.sub?.status === "active" && !u.sub?.stripe_subscription_id) ? (
                              <span className="text-xs font-medium text-green-600">Beta ✓</span>
                            ) : !u.sub || (u.sub.status !== "active" && u.sub.status !== "trialing") ? (
                              <button
                                onClick={() => handleGrantBetaAccess(u.id, u.email)}
                                disabled={grantingBeta[u.id]}
                                className="text-xs font-medium text-navy hover:text-navy-dark hover:underline disabled:opacity-50 disabled:no-underline"
                              >
                                {grantingBeta[u.id] ? "Granting…" : "Grant Beta"}
                              </button>
                            ) : null}
                            <button
                              onClick={() => handleDeleteUser(u.id, u.email)}
                              disabled={deletingUsers[u.id]}
                              className="text-xs font-medium text-red-600 hover:text-red-700 hover:underline disabled:opacity-50 disabled:no-underline"
                            >
                              {deletingUsers[u.id] ? "Deleting…" : "Delete"}
                            </button>
                          </div>
                          {grantErrors[u.id] && (
                            <div className="text-[11px] text-red-500 mt-0.5">{grantErrors[u.id]}</div>
                          )}
                          {deleteErrors[u.id] && (
                            <div className="text-[11px] text-red-500 mt-0.5">{deleteErrors[u.id]}</div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Payments ── */}
        {tab === "payments" && (
          <div className="space-y-4">
            {paymentsLoading && (
              <div className="text-center py-16 text-gray-400 text-sm animate-pulse">Loading payments from Stripe…</div>
            )}
            {paymentsError && (
              <div className="text-center py-16 text-red-500 text-sm">{paymentsError}</div>
            )}
            {!paymentsLoading && !paymentsError && (
              <>
                {/* Payment stats */}
                {paymentStats && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <StatCard
                      label="Total Collected"
                      value={`$${(paymentStats.totalRevenue / 100).toLocaleString()}`}
                      accent="green"
                    />
                    <StatCard
                      label="Total Invoices"
                      value={payments.length}
                    />
                    <StatCard
                      label="Paid"
                      value={payments.filter((p) => p.status === "paid").length}
                      accent="green"
                    />
                    <StatCard
                      label="Failed / Open"
                      value={paymentStats.failedCount}
                      accent={paymentStats.failedCount > 0 ? "red" : undefined}
                    />
                  </div>
                )}

                {/* Filters */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    placeholder="Search by email or name…"
                    value={paymentSearch}
                    onChange={(e) => setPaymentSearch(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20"
                  />
                  <select
                    value={paymentStatusFilter}
                    onChange={(e) => setPaymentStatusFilter(e.target.value as PaymentRow["status"] | "all")}
                    className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20"
                  >
                    <option value="all">All statuses</option>
                    <option value="paid">Paid</option>
                    <option value="open">Open / Failed</option>
                    <option value="void">Void</option>
                    <option value="uncollectible">Uncollectible</option>
                  </select>
                </div>

                {/* Table */}
                <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <Th>Customer</Th>
                        <Th>Plan</Th>
                        <Th>Amount</Th>
                        <Th>Status</Th>
                        <Th>Date</Th>
                        <Th>Attempts</Th>
                        <Th>Invoice</Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {payments
                        .filter((p) => {
                          const q = paymentSearch.toLowerCase();
                          const matchSearch = !q ||
                            p.customerEmail.toLowerCase().includes(q) ||
                            (p.customerName ?? "").toLowerCase().includes(q);
                          const matchStatus = paymentStatusFilter === "all" || p.status === paymentStatusFilter;
                          return matchSearch && matchStatus;
                        })
                        .map((p) => {
                          const isPaid = p.status === "paid";
                          const isFailed = p.status === "open" && p.attemptCount > 0;
                          const statusLabel = isFailed ? "Failed" : p.status.charAt(0).toUpperCase() + p.status.slice(1);
                          const statusCls = isPaid
                            ? "bg-green-100 text-green-700"
                            : isFailed
                            ? "bg-red-100 text-red-700"
                            : p.status === "open"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-gray-100 text-gray-500";
                          const amount = (p.amount / 100).toLocaleString("en-US", { style: "currency", currency: p.currency.toUpperCase() });
                          return (
                            <tr key={p.id} className={`hover:bg-gray-50/50 ${isFailed ? "bg-red-50/30" : ""}`}>
                              <td className="px-4 py-3">
                                <div className="font-medium text-gray-900">{p.customerEmail}</div>
                                {p.customerName && <div className="text-xs text-gray-400">{p.customerName}</div>}
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs text-gray-600">{p.plan ?? "—"}</span>
                              </td>
                              <td className="px-4 py-3 font-semibold text-gray-900">{amount}</td>
                              <td className="px-4 py-3">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusCls}`}>
                                  {statusLabel}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                                {new Date(p.created * 1000).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-3 text-gray-500 text-xs">
                                {p.attemptCount}
                                {p.nextPaymentAttempt && (
                                  <span className="ml-1 text-amber-600">
                                    (retry {new Date(p.nextPaymentAttempt * 1000).toLocaleDateString()})
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  {p.hostedUrl && (
                                    <a href={p.hostedUrl} target="_blank" rel="noreferrer"
                                      className="text-xs text-[#2E6DA4] hover:underline">View</a>
                                  )}
                                  {p.pdfUrl && (
                                    <a href={p.pdfUrl} target="_blank" rel="noreferrer"
                                      className="text-xs text-gray-400 hover:underline">PDF</a>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      {payments.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-center py-12 text-gray-400">
                            No invoices found in Stripe
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "green" | "blue" | "red";
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${
        accent === "green" ? "text-green-600" :
        accent === "blue" ? "text-[#2E6DA4]" :
        accent === "red" ? "text-red-600" :
        "text-[#1A3A5C]"
      }`}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function PipelineStat({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: "amber" | "blue" | "green" | "red";
}) {
  const cls = {
    amber: "text-amber-600 bg-amber-50",
    blue: "text-blue-600 bg-blue-50",
    green: "text-green-600 bg-green-50",
    red: "text-red-600 bg-red-50",
  }[color];
  return (
    <div className={`rounded-xl px-4 py-3 ${cls}`}>
      <p className="text-2xl font-bold">{count}</p>
      <p className="text-xs font-medium opacity-80 mt-0.5">{label}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
      {children}
    </th>
  );
}

function AppTable({
  apps,
  userEmails,
  redeploying,
  redeployMessages,
  onRedeploy,
}: {
  apps: AdminDashboardProps["apps"];
  userEmails: Record<string, string>;
  redeploying: Record<string, boolean>;
  redeployMessages: Record<string, string>;
  onRedeploy: (id: string) => void;
}) {
  const canRedeploy = (status: AppStatus) =>
    status === "failed" || status === "deploy_failed" || status === "ready";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr>
            <Th>App</Th>
            <Th>User</Th>
            <Th>Status</Th>
            <Th>Created</Th>
            <Th>URL</Th>
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {apps.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-center py-12 text-gray-400">
                No apps found
              </td>
            </tr>
          ) : (
            apps.map((app) => {
              const statusCfg = STATUS_STYLE[app.status] ?? { label: app.status, cls: "bg-gray-100 text-gray-500" };
              const email = userEmails[app.user_id] ?? app.user_id.slice(0, 8) + "…";
              const msg = redeployMessages[app.id];
              return (
                <tr key={app.id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{CATEGORY_ICONS[app.category]}</span>
                      <div>
                        <div className="font-medium text-gray-900">{app.name}</div>
                        <div className="text-xs text-gray-400 capitalize">{app.category}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusCfg.cls}`}>
                      {statusCfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                    {new Date(app.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {app.deploy_url ? (
                      <a
                        href={app.deploy_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[#2E6DA4] hover:underline truncate block max-w-[160px]"
                      >
                        {app.deploy_url.replace("https://", "")}
                      </a>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {canRedeploy(app.status) && (
                        <button
                          onClick={() => onRedeploy(app.id)}
                          disabled={redeploying[app.id]}
                          className="text-xs px-3 py-1 rounded-lg bg-[#1A3A5C] text-white hover:bg-[#2E6DA4] disabled:opacity-50 transition-colors whitespace-nowrap"
                        >
                          {redeploying[app.id] ? "…" : "Redeploy"}
                        </button>
                      )}
                      {msg && (
                        <span className={`text-xs ${msg.includes("✓") ? "text-green-600" : "text-red-500"}`}>
                          {msg}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
