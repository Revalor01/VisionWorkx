"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { App, AppCategory, AppStatus, AutomationEvent, Lead, LeadLanguage, LeadStatus, Plan, Profile, Subscription } from "@/lib/database.types";
import type { PaymentRow } from "@/app/api/admin/payments/route";
import { semanticEventLabel } from "@/lib/automationEventLabel";
import { scoreBucket } from "@/lib/leadScoring";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdminDashboardProps {
  apps: Pick<App, "id" | "user_id" | "name" | "category" | "status" | "deploy_url" | "created_at" | "intake_data">[];
  profiles: Pick<Profile, "id" | "full_name" | "company_name" | "plan" | "created_at">[];
  subscriptions: Pick<Subscription, "user_id" | "plan" | "status" | "current_period_end" | "stripe_subscription_id">[];
  userEmails: Record<string, string>;
  automationEvents: AutomationEvent[];
  undeliveredCount: number;
  oldestUndeliveredAt: string | null;
  instrumentedAppIds: string[];
  initialLeads: Lead[];
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
  invoicing: "🧾",
  membership: "🎫",
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

type Tab = "overview" | "apps" | "users" | "payments" | "automations" | "leads";

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminDashboard({
  apps,
  profiles,
  subscriptions,
  userEmails,
  automationEvents,
  undeliveredCount,
  oldestUndeliveredAt,
  instrumentedAppIds,
  initialLeads,
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
  const [revokingBeta, setRevokingBeta] = useState<Record<string, boolean>>({});
  const [revokedBetaIds, setRevokedBetaIds] = useState<Set<string>>(new Set());
  const [revokeErrors, setRevokeErrors] = useState<Record<string, string>>({});
  const ITEMS_PER_PAGE = 30;
  const [appsPage, setAppsPage] = useState(1);
  const [usersPage, setUsersPage] = useState(1);
  const [eventsPage, setEventsPage] = useState(1);

  useEffect(() => {
    setAppsPage(1);
  }, [appSearch, appStatusFilter]);

  useEffect(() => {
    setUsersPage(1);
  }, [userSearch]);

  // ── Payments state ─────────────────────────────────────────────
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [paymentStats, setPaymentStats] = useState<{ totalRevenue: number; failedCount: number } | null>(null);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState("");
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<PaymentRow["status"] | "all">("all");

  // ── Leads state ─────────────────────────────────────────────────
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [leadSearchLocation, setLeadSearchLocation] = useState("");
  const [leadSearchRadius, setLeadSearchRadius] = useState(5);
  const [searchingLeads, setSearchingLeads] = useState(false);
  const [leadSearchError, setLeadSearchError] = useState("");
  const [leadSearchResult, setLeadSearchResult] = useState("");
  const [leadStatusFilter, setLeadStatusFilter] = useState<LeadStatus | "all">("all");
  const [leadCategoryFilter, setLeadCategoryFilter] = useState<string>("all");
  const [leadLanguageFilter, setLeadLanguageFilter] = useState<LeadLanguage | "all">("all");
  const [leadWebsiteFilter, setLeadWebsiteFilter] = useState<"all" | "yes" | "no">("all");
  const [leadEmailFilter, setLeadEmailFilter] = useState<"all" | "yes" | "no">("all");
  const [leadMinScore, setLeadMinScore] = useState(0);
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);
  const [leadsPage, setLeadsPage] = useState(1);
  const LEADS_PER_PAGE = 30;
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailMode, setEmailMode] = useState<"generic" | "custom">("generic");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [sendingEmails, setSendingEmails] = useState(false);
  const [emailSendError, setEmailSendError] = useState("");
  const [emailSendResult, setEmailSendResult] = useState("");

  useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);

  useEffect(() => {
    setLeadsPage(1);
  }, [leadStatusFilter, leadCategoryFilter, leadLanguageFilter, leadWebsiteFilter, leadEmailFilter, leadMinScore]);

  async function handleLeadSearch() {
    if (!leadSearchLocation.trim()) return;
    setSearchingLeads(true);
    setLeadSearchError("");
    setLeadSearchResult("");
    try {
      const res = await fetch("/api/admin/leads/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location: leadSearchLocation, radiusMiles: leadSearchRadius }),
      });
      const data = await res.json();
      if (res.ok) {
        setLeadSearchResult(`Found ${data.found}, saved ${data.upserted}.`);
        if (data.leads?.length) {
          setLeads((prev) => {
            const byId = new Map(prev.map((l) => [l.id, l]));
            for (const lead of data.leads as Lead[]) byId.set(lead.id, lead);
            return Array.from(byId.values()).sort((a, b) => b.final_score - a.final_score);
          });
          setLeadsPage(1);
        }
      } else {
        setLeadSearchError(data.error ?? "Search failed");
      }
    } catch {
      setLeadSearchError("Network error");
    } finally {
      setSearchingLeads(false);
    }
  }

  async function handleLeadStatusChange(leadId: string, status: LeadStatus) {
    setUpdatingLeadId(leadId);
    try {
      const res = await fetch("/api/admin/leads/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, status }),
      });
      if (res.ok) {
        setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status } : l)));
      }
    } finally {
      setUpdatingLeadId(null);
    }
  }

  function toggleLeadSelected(leadId: string) {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }

  function toggleSelectAllFiltered() {
    setSelectedLeadIds((prev) => {
      const allSelected = filteredLeads.length > 0 && filteredLeads.every((l) => prev.has(l.id));
      if (allSelected) return new Set();
      return new Set(filteredLeads.map((l) => l.id));
    });
  }

  const selectedEmailableCount = useMemo(
    () => leads.filter((l) => selectedLeadIds.has(l.id) && l.email).length,
    [leads, selectedLeadIds]
  );

  async function handleSendLeadEmails() {
    setSendingEmails(true);
    setEmailSendError("");
    setEmailSendResult("");
    try {
      const res = await fetch("/api/admin/leads/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadIds: Array.from(selectedLeadIds),
          mode: emailMode,
          subject: emailMode === "custom" ? emailSubject : undefined,
          body: emailMode === "custom" ? emailBody : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setEmailSendResult(`Sent ${data.sent}, skipped ${data.skipped} (no email), ${data.failed.length} failed.`);
        if (data.sentLeadIds?.length) {
          const sentIds = new Set<string>(data.sentLeadIds);
          setLeads((prev) =>
            prev.map((l) => (sentIds.has(l.id) && l.status === "new" ? { ...l, status: "contacted" as LeadStatus } : l))
          );
        }
        setSelectedLeadIds(new Set());
        setEmailModalOpen(false);
        setEmailSubject("");
        setEmailBody("");
      } else {
        setEmailSendError(data.error ?? "Send failed");
      }
    } catch {
      setEmailSendError("Network error");
    } finally {
      setSendingEmails(false);
    }
  }

  const leadCategories = useMemo(
    () => Array.from(new Set(leads.map((l) => l.industry_category).filter(Boolean))) as string[],
    [leads]
  );

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      if (leadStatusFilter !== "all" && l.status !== leadStatusFilter) return false;
      if (leadCategoryFilter !== "all" && l.industry_category !== leadCategoryFilter) return false;
      if (leadLanguageFilter !== "all" && l.detected_language !== leadLanguageFilter) return false;
      if (leadWebsiteFilter === "yes" && !l.website) return false;
      if (leadWebsiteFilter === "no" && l.website) return false;
      if (leadEmailFilter === "yes" && !l.email) return false;
      if (leadEmailFilter === "no" && l.email) return false;
      if (l.final_score < leadMinScore) return false;
      return true;
    });
  }, [leads, leadStatusFilter, leadCategoryFilter, leadLanguageFilter, leadWebsiteFilter, leadEmailFilter, leadMinScore]);

  const leadsTotalPages = Math.max(1, Math.ceil(filteredLeads.length / LEADS_PER_PAGE));
  const paginatedLeads = useMemo(
    () => filteredLeads.slice((leadsPage - 1) * LEADS_PER_PAGE, leadsPage * LEADS_PER_PAGE),
    [filteredLeads, leadsPage]
  );

  const leadStats = useMemo(() => {
    const buckets = { hot: 0, warm: 0, potential: 0, low: 0 };
    let scoreSum = 0;
    for (const l of filteredLeads) {
      buckets[scoreBucket(l.final_score).tier]++;
      scoreSum += l.final_score;
    }
    return {
      total: filteredLeads.length,
      avgScore: filteredLeads.length > 0 ? Math.round(scoreSum / filteredLeads.length) : 0,
      ...buckets,
    };
  }, [filteredLeads]);

  function exportLeadsCsv() {
    const headers = ["Business Name", "Category", "Language", "Score", "Yelp Rating", "Yelp Reviews", "Status", "Phone", "Email", "Has Website", "Website", "Distance (mi)", "Address", "Discovered"];
    const rows = filteredLeads.map((l) => [
      l.business_name,
      l.industry_category ?? "",
      l.detected_language === "es" ? "Spanish" : "English",
      String(l.final_score),
      l.yelp_rating != null ? String(l.yelp_rating) : "",
      l.yelp_review_count != null ? String(l.yelp_review_count) : "",
      l.status,
      l.phone ?? "",
      l.email ?? "",
      l.website ? "Yes" : "No",
      l.website ?? "",
      l.distance_miles != null ? String(l.distance_miles) : "",
      l.address ?? "",
      new Date(l.discovered_at).toLocaleDateString(),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

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

  // ── Automations derived state ───────────────────────────────────
  const instrumentedSet = useMemo(() => new Set(instrumentedAppIds), [instrumentedAppIds]);
  const oldestPendingAgeMinutes = useMemo(() => {
    if (!oldestUndeliveredAt) return null;
    return Math.round((Date.now() - new Date(oldestUndeliveredAt).getTime()) / 60000);
  }, [oldestUndeliveredAt]);

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

  // ── Pagination ──────────────────────────────────────────────────
  const appsTotalPages = Math.max(1, Math.ceil(filteredApps.length / ITEMS_PER_PAGE));
  const appsPageClamped = Math.min(appsPage, appsTotalPages);
  const paginatedApps = useMemo(
    () => filteredApps.slice((appsPageClamped - 1) * ITEMS_PER_PAGE, appsPageClamped * ITEMS_PER_PAGE),
    [filteredApps, appsPageClamped]
  );

  const usersTotalPages = Math.max(1, Math.ceil(filteredUsers.length / ITEMS_PER_PAGE));
  const usersPageClamped = Math.min(usersPage, usersTotalPages);
  const paginatedUsers = useMemo(
    () => filteredUsers.slice((usersPageClamped - 1) * ITEMS_PER_PAGE, usersPageClamped * ITEMS_PER_PAGE),
    [filteredUsers, usersPageClamped]
  );

  const eventsTotalPages = Math.max(1, Math.ceil(automationEvents.length / ITEMS_PER_PAGE));
  const eventsPageClamped = Math.min(eventsPage, eventsTotalPages);
  const paginatedEvents = useMemo(
    () => automationEvents.slice((eventsPageClamped - 1) * ITEMS_PER_PAGE, eventsPageClamped * ITEMS_PER_PAGE),
    [automationEvents, eventsPageClamped]
  );

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

  // ── Revoke beta access action ───────────────────────────────────
  async function handleRevokeBetaAccess(userId: string, email: string) {
    const confirmed = window.confirm(
      `Revoke beta access for ${email || userId}?\n\nThis removes their comp subscription and reverts them to a normal free-trial account. Their apps and profile are untouched.`
    );
    if (!confirmed) return;

    setRevokingBeta((r) => ({ ...r, [userId]: true }));
    setRevokeErrors((e) => ({ ...e, [userId]: "" }));
    try {
      const res = await fetch("/api/admin/revoke-beta-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (res.ok) {
        setRevokedBetaIds((ids) => new Set(ids).add(userId));
        router.refresh();
      } else {
        setRevokeErrors((e) => ({ ...e, [userId]: data.error ?? "Failed" }));
      }
    } catch {
      setRevokeErrors((e) => ({ ...e, [userId]: "Network error" }));
    } finally {
      setRevokingBeta((r) => ({ ...r, [userId]: false }));
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
          <Link href="/admin/social" className="text-xs text-white/70 hover:text-white transition-colors">
            Social Media →
          </Link>
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
          {(["overview", "apps", "users", "payments", "automations", "leads"] as Tab[]).map((t) => (
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
                apps={paginatedApps}
                userEmails={userEmails}
                redeploying={redeploying}
                redeployMessages={redeployMessages}
                onRedeploy={handleRedeploy}
              />
              <Pagination
                page={appsPageClamped}
                totalPages={appsTotalPages}
                onPrev={() => setAppsPage((p) => Math.max(1, p - 1))}
                onNext={() => setAppsPage((p) => Math.min(appsTotalPages, p + 1))}
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
                    paginatedUsers.map((u) => (
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
                            {!revokedBetaIds.has(u.id) &&
                            (grantedBetaIds.has(u.id) || (u.sub?.status === "active" && !u.sub?.stripe_subscription_id)) ? (
                              <>
                                <span className="text-xs font-medium text-green-600">Beta ✓</span>
                                <button
                                  onClick={() => handleRevokeBetaAccess(u.id, u.email)}
                                  disabled={revokingBeta[u.id]}
                                  className="text-xs font-medium text-gray-500 hover:text-gray-700 hover:underline disabled:opacity-50 disabled:no-underline"
                                >
                                  {revokingBeta[u.id] ? "Revoking…" : "Revoke"}
                                </button>
                              </>
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
                          {revokeErrors[u.id] && (
                            <div className="text-[11px] text-red-500 mt-0.5">{revokeErrors[u.id]}</div>
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
              <Pagination
                page={usersPageClamped}
                totalPages={usersTotalPages}
                onPrev={() => setUsersPage((p) => Math.max(1, p - 1))}
                onNext={() => setUsersPage((p) => Math.min(usersTotalPages, p + 1))}
              />
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

        {/* ── Automations ── */}
        {tab === "automations" && (
          <div className="space-y-6">
            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <StatCard
                label="Undelivered Events"
                value={undeliveredCount}
                accent={undeliveredCount > 0 ? "blue" : undefined}
              />
              <StatCard
                label="Oldest Pending"
                value={oldestPendingAgeMinutes === null ? "—" : `${oldestPendingAgeMinutes}m`}
                accent={oldestPendingAgeMinutes !== null && oldestPendingAgeMinutes > 15 ? "red" : undefined}
                sub={oldestPendingAgeMinutes !== null && oldestPendingAgeMinutes > 15 ? "Poller may be down" : undefined}
              />
              <StatCard
                label="Apps Instrumented"
                value={`${apps.filter((a) => instrumentedSet.has(a.id)).length}/${apps.length}`}
                accent={instrumentedSet.size === apps.length ? "green" : undefined}
              />
            </div>

            {/* Per-app instrumentation status */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">App Instrumentation</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Whether emit_automation_event is actually attached in each app&apos;s tenant schema
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <Th>App</Th>
                      <Th>Status</Th>
                      <Th>Instrumented</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {apps.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="text-center py-12 text-gray-400">
                          No apps found
                        </td>
                      </tr>
                    ) : (
                      apps.map((app) => (
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
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${(STATUS_STYLE[app.status] ?? { cls: "bg-gray-100 text-gray-500" }).cls}`}>
                              {(STATUS_STYLE[app.status] ?? { label: app.status }).label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {instrumentedSet.has(app.id) ? (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Yes</span>
                            ) : (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">No</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent events */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Recent Events</h2>
                <p className="text-xs text-gray-400 mt-0.5">Last {automationEvents.length} events across all apps</p>
              </div>
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                    <tr>
                      <Th>Time</Th>
                      <Th>App</Th>
                      <Th>Event</Th>
                      <Th>Delivered</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {paginatedEvents.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-12 text-gray-400">
                          No events recorded yet
                        </td>
                      </tr>
                    ) : (
                      paginatedEvents.map((event) => {
                        const app = apps.find((a) => a.id === event.app_id);
                        const label = semanticEventLabel(app?.category, event.table_name, event.operation);
                        return (
                          <tr key={event.id} className="hover:bg-gray-50/50">
                            <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                              {new Date(event.created_at).toLocaleString()}
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-gray-900 font-medium">{app?.name ?? event.app_id.slice(0, 8) + "…"}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{label}</span>
                            </td>
                            <td className="px-4 py-3">
                              {event.delivered_at ? (
                                <span className="text-xs text-green-600">✓</span>
                              ) : (
                                <span className="text-xs text-amber-600">pending</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={eventsPageClamped}
                totalPages={eventsTotalPages}
                onPrev={() => setEventsPage((p) => Math.max(1, p - 1))}
                onNext={() => setEventsPage((p) => Math.min(eventsTotalPages, p + 1))}
              />
            </div>
          </div>
        )}

        {/* ── Leads ── */}
        {tab === "leads" && (
          <div className="space-y-6">
            {/* Search */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-1">Find Leads</h2>
              <p className="text-xs text-gray-400 mb-4">Searches OpenStreetMap around a location and scores every business found.</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder="City, state or ZIP (e.g. Charlotte, NC)"
                  value={leadSearchLocation}
                  onChange={(e) => setLeadSearchLocation(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20"
                />
                <select
                  value={leadSearchRadius}
                  onChange={(e) => setLeadSearchRadius(Number(e.target.value))}
                  className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20"
                >
                  {[1, 3, 5, 10, 15, 25].map((r) => (
                    <option key={r} value={r}>{r} mi radius</option>
                  ))}
                </select>
                <button
                  onClick={handleLeadSearch}
                  disabled={searchingLeads || !leadSearchLocation.trim()}
                  className="px-6 py-2.5 rounded-xl bg-[#1A3A5C] text-white text-sm font-semibold hover:bg-[#2E6DA4] disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {searchingLeads ? "Searching…" : "Search"}
                </button>
              </div>
              {leadSearchResult && <p className="text-xs text-green-600 mt-2">{leadSearchResult}</p>}
              {leadSearchError && <p className="text-xs text-red-500 mt-2">{leadSearchError}</p>}
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <StatCard label="Leads (filtered)" value={leadStats.total} />
              <StatCard label="Avg Score" value={leadStats.avgScore} />
              <StatCard label="🔥 Hot" value={leadStats.hot} accent="red" />
              <StatCard label="♨️ Warm" value={leadStats.warm} accent="blue" />
              <StatCard label="☑ Potential" value={leadStats.potential} accent="green" />
            </div>

            {/* Filters + export */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <select
                value={leadStatusFilter}
                onChange={(e) => setLeadStatusFilter(e.target.value as LeadStatus | "all")}
                className="border border-gray-200 rounded-xl px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20"
              >
                <option value="all">All statuses</option>
                {(["new", "contacted", "responded", "qualified", "converted", "dead"] as LeadStatus[]).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select
                value={leadCategoryFilter}
                onChange={(e) => setLeadCategoryFilter(e.target.value)}
                className="border border-gray-200 rounded-xl px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20"
              >
                <option value="all">All categories</option>
                {leadCategories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select
                value={leadLanguageFilter}
                onChange={(e) => setLeadLanguageFilter(e.target.value as LeadLanguage | "all")}
                className="border border-gray-200 rounded-xl px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20"
              >
                <option value="all">All languages</option>
                <option value="en">English</option>
                <option value="es">Spanish</option>
              </select>
              <select
                value={leadWebsiteFilter}
                onChange={(e) => setLeadWebsiteFilter(e.target.value as "all" | "yes" | "no")}
                className="border border-gray-200 rounded-xl px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20"
              >
                <option value="all">Website: all</option>
                <option value="yes">Has website</option>
                <option value="no">No website</option>
              </select>
              <select
                value={leadEmailFilter}
                onChange={(e) => setLeadEmailFilter(e.target.value as "all" | "yes" | "no")}
                className="border border-gray-200 rounded-xl px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20"
              >
                <option value="all">Email: all</option>
                <option value="yes">Has email</option>
                <option value="no">No email</option>
              </select>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>Min score</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={leadMinScore}
                  onChange={(e) => setLeadMinScore(Number(e.target.value))}
                  className="w-20 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20"
                />
              </div>
              <button
                onClick={() => setEmailModalOpen(true)}
                disabled={selectedEmailableCount === 0}
                className="ml-auto text-xs font-semibold px-4 py-2 rounded-xl bg-[#1A3A5C] text-white hover:bg-[#2E6DA4] disabled:opacity-50 disabled:hover:bg-[#1A3A5C] transition-colors whitespace-nowrap"
              >
                ✉ Email Selected ({selectedEmailableCount})
              </button>
              <button
                onClick={exportLeadsCsv}
                disabled={filteredLeads.length === 0}
                className="text-xs font-semibold px-4 py-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                ⬇ Export CSV ({filteredLeads.length})
              </button>
            </div>
            {emailSendResult && <p className="text-xs text-green-600">{emailSendResult}</p>}

            {/* Table */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <Th>
                        <input
                          type="checkbox"
                          checked={filteredLeads.length > 0 && filteredLeads.every((l) => selectedLeadIds.has(l.id))}
                          onChange={toggleSelectAllFiltered}
                          className="rounded border-gray-300"
                        />
                      </Th>
                      <Th>Business</Th>
                      <Th>Category</Th>
                      <Th>Lang</Th>
                      <Th>Score</Th>
                      <Th>Yelp</Th>
                      <Th>Website</Th>
                      <Th>Distance</Th>
                      <Th>Phone</Th>
                      <Th>Email</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {paginatedLeads.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="text-center py-12 text-gray-400">
                          No leads yet — run a search above.
                        </td>
                      </tr>
                    ) : (
                      paginatedLeads.map((lead) => {
                        const bucket = scoreBucket(lead.final_score);
                        const bucketCls =
                          bucket.tier === "hot" ? "bg-red-100 text-red-700" :
                          bucket.tier === "warm" ? "bg-amber-100 text-amber-700" :
                          bucket.tier === "potential" ? "bg-sky-100 text-sky-700" :
                          "bg-gray-100 text-gray-500";
                        return (
                          <tr key={lead.id} className="hover:bg-gray-50/50">
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={selectedLeadIds.has(lead.id)}
                                onChange={() => toggleLeadSelected(lead.id)}
                                className="rounded border-gray-300"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">{lead.business_name}</div>
                              <div className="text-xs text-gray-400">{lead.address ?? "—"}</div>
                            </td>
                            <td className="px-4 py-3 text-gray-600 text-xs">{lead.industry_category ?? "—"}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                lead.detected_language === "es" ? "bg-violet-100 text-violet-700" : "bg-gray-100 text-gray-500"
                              }`}>
                                {lead.detected_language === "es" ? "ES" : "EN"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${bucketCls}`}>
                                {lead.final_score}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                              {lead.yelp_rating != null ? (
                                <span>★{lead.yelp_rating.toFixed(1)} ({lead.yelp_review_count ?? 0})</span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {lead.website ? (
                                <a
                                  href={lead.website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-green-600 hover:underline block max-w-[160px] truncate"
                                  title={lead.website}
                                >
                                  {lead.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                                </a>
                              ) : (
                                <span className="text-xs text-red-500">✗ No</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                              {lead.distance_miles != null ? `${lead.distance_miles} mi` : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600">{lead.phone ?? <span className="text-gray-300">—</span>}</td>
                            <td className="px-4 py-3 text-xs text-gray-600">
                              {lead.email ? (
                                <a
                                  href={`mailto:${lead.email}`}
                                  className="text-green-600 hover:underline block max-w-[180px] truncate"
                                  title={lead.email}
                                >
                                  {lead.email}
                                </a>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={lead.status}
                                disabled={updatingLeadId === lead.id}
                                onChange={(e) => handleLeadStatusChange(lead.id, e.target.value as LeadStatus)}
                                className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white disabled:opacity-50"
                              >
                                {(["new", "contacted", "responded", "qualified", "converted", "dead"] as LeadStatus[]).map((s) => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={leadsPage}
                totalPages={leadsTotalPages}
                onPrev={() => setLeadsPage((p) => Math.max(1, p - 1))}
                onNext={() => setLeadsPage((p) => Math.min(leadsTotalPages, p + 1))}
              />
            </div>

            {/* Email compose modal */}
            {emailModalOpen && (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-2xl p-6 w-full max-w-lg">
                  <h3 className="text-lg font-bold text-[#1A3A5C] mb-1">Email {selectedEmailableCount} lead{selectedEmailableCount === 1 ? "" : "s"}</h3>
                  <p className="text-xs text-gray-400 mb-4">The Revalor Media Guide PDF is attached automatically to every send.</p>
                  {emailSendError && <div className="mb-3 p-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{emailSendError}</div>}

                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => setEmailMode("generic")}
                      className={`flex-1 text-xs font-semibold px-3 py-2 rounded-xl border transition-colors ${
                        emailMode === "generic" ? "bg-[#1A3A5C] text-white border-[#1A3A5C]" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      Generic Text
                    </button>
                    <button
                      onClick={() => setEmailMode("custom")}
                      className={`flex-1 text-xs font-semibold px-3 py-2 rounded-xl border transition-colors ${
                        emailMode === "custom" ? "bg-[#1A3A5C] text-white border-[#1A3A5C]" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      Freeform
                    </button>
                  </div>

                  {emailMode === "generic" ? (
                    <div className="mb-4 p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-600 space-y-2">
                      <p className="font-semibold text-gray-500">Subject: A quick idea for [Business Name]</p>
                      <p>Hi [Business Name] team,</p>
                      <p>I&apos;m reaching out from Revalor LLC — we build software that helps businesses like yours save time and grow. I&apos;ve attached a quick guide to what we offer.</p>
                      <p>Happy to answer any questions.</p>
                      <p>Best,<br />Revalor Team</p>
                    </div>
                  ) : (
                    <div className="mb-4 space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Subject</label>
                        <input
                          type="text"
                          value={emailSubject}
                          onChange={(e) => setEmailSubject(e.target.value)}
                          placeholder="e.g. A quick idea for {{business_name}}"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Body</label>
                        <textarea
                          value={emailBody}
                          onChange={(e) => setEmailBody(e.target.value)}
                          rows={6}
                          placeholder="Hi {{business_name}} team, ..."
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">Use <code>{"{{business_name}}"}</code> to personalize each email.</p>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setEmailModalOpen(false)}
                      disabled={sendingEmails}
                      className="text-sm font-semibold px-4 py-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSendLeadEmails}
                      disabled={sendingEmails || (emailMode === "custom" && (!emailSubject.trim() || !emailBody.trim()))}
                      className="text-sm font-semibold px-4 py-2 rounded-xl bg-[#1A3A5C] text-white hover:bg-[#2E6DA4] disabled:opacity-50"
                    >
                      {sendingEmails ? "Sending…" : `Send to ${selectedEmailableCount}`}
                    </button>
                  </div>
                </div>
              </div>
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

function Pagination({
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
      <button
        onClick={onPrev}
        disabled={page <= 1}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        ← Prev
      </button>
      <span className="text-xs text-gray-500">
        Page {page} of {totalPages}
      </span>
      <button
        onClick={onNext}
        disabled={page >= totalPages}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Next →
      </button>
    </div>
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
