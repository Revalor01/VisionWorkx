"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { App, AppCategory, AppRevisionKind, AppRevisionStatus, AppStatus, AutomationEvent, Lead, LeadLanguage, LeadStatus, Plan, PartnerApplication, PartnerReferral, PartnerReferralStatus, PartnerStatus, PartnerTier, Profile, Subscription } from "@/lib/database.types";
import type { PaymentRow } from "@/app/api/admin/payments/route";
import { semanticEventLabel } from "@/lib/automationEventLabel";
import { scoreBucket } from "@/lib/leadScoring";
import {
  BUILD_COST_ESTIMATES,
  estimatedBuildInfraUsd,
  UNMODELED_COSTS,
} from "@/lib/apps/buildCost";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdminDashboardProps {
  apps: Pick<App, "id" | "user_id" | "name" | "category" | "status" | "deploy_url" | "created_at" | "intake_data" | "payments_test_mode" | "build_notice" | "build_notice_at" | "failure_reason">[];
  profiles: Pick<Profile, "id" | "full_name" | "company_name" | "plan" | "created_at">[];
  subscriptions: Pick<Subscription, "user_id" | "plan" | "status" | "current_period_end" | "stripe_subscription_id">[];
  userEmails: Record<string, string>;
  automationEvents: AutomationEvent[];
  undeliveredCount: number;
  oldestUndeliveredAt: string | null;
  instrumentedAppIds: string[];
  initialLeads: Lead[];
  initialPartners: PartnerApplication[];
  initialReferrals: PartnerReferral[];
  revisions: { kind: AppRevisionKind; status: AppRevisionStatus; created_at: string }[];
  guidedSessions: number;
  aiUsage: { source: string; cost_usd: number | null; created_at: string; app_id: string | null }[];
  canaryRuns: {
    intake_key: string;
    status: string;
    failure_reason: string | null;
    duration_sec: number | null;
    created_at: string;
  }[];
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
  storefront: "🛍️",
};

const STATUS_STYLE: Record<AppStatus, { label: string; cls: string }> = {
  generating: { label: "Generating", cls: "bg-amber-100 text-amber-700" },
  ready:      { label: "Queued",     cls: "bg-sky-100 text-sky-700" },
  deploying:  { label: "Deploying",  cls: "bg-blue-100 text-blue-700" },
  deployed:   { label: "Live",       cls: "bg-green-100 text-green-700" },
  failed:     { label: "Failed",     cls: "bg-red-100 text-red-700" },
  deploy_failed: { label: "Deploy Failed", cls: "bg-red-100 text-red-700" },
  test_skipped: { label: "Test run", cls: "bg-gray-100 text-gray-600" },
};

const PLAN_STYLE: Record<Plan, string> = {
  free:     "bg-zinc-100 text-zinc-700",
  starter:  "bg-sky-100 text-sky-700",
  growth:   "bg-violet-100 text-violet-700",
  pro:      "bg-amber-100 text-amber-700",
};

const PARTNER_STATUS_STYLE: Record<PartnerStatus, { label: string; cls: string }> = {
  pending:  { label: "Pending Review", cls: "bg-amber-100 text-amber-700" },
  approved: { label: "Approved",       cls: "bg-green-100 text-green-700" },
  denied:   { label: "Denied",         cls: "bg-red-100 text-red-700" },
};

const PARTNER_TIER_STYLE: Record<PartnerTier, { label: string; cls: string }> = {
  tier_1: { label: "Tier 1 — High Value", cls: "bg-violet-100 text-violet-700" },
  tier_2: { label: "Tier 2 — Standard",   cls: "bg-sky-100 text-sky-700" },
  tier_3: { label: "Tier 3 — Entry",      cls: "bg-zinc-100 text-zinc-700" },
};

const PARTNER_REFERRAL_STATUS_STYLE: Record<PartnerReferralStatus, { label: string; cls: string }> = {
  submitted: { label: "Submitted", cls: "bg-zinc-100 text-zinc-700" },
  contacted: { label: "Contacted", cls: "bg-amber-100 text-amber-700" },
  converted: { label: "Converted", cls: "bg-green-100 text-green-700" },
  declined:  { label: "Declined",  cls: "bg-red-100 text-red-700" },
};

type Tab = "overview" | "apps" | "users" | "payments" | "automations" | "leads" | "partners" | "referrals";

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
  initialPartners,
  initialReferrals,
  revisions,
  aiUsage,
  guidedSessions,
  canaryRuns,
}: AdminDashboardProps) {
  const router = useRouter();
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [appSearch, setAppSearch] = useState("");
  const [appStatusFilter, setAppStatusFilter] = useState<AppStatus | "all">("all");
  const [userSearch, setUserSearch] = useState("");
  const [redeploying, setRedeploying] = useState<Record<string, boolean>>({});
  const [redeployMessages, setRedeployMessages] = useState<Record<string, string>>({});
  const [noticeMessages, setNoticeMessages] = useState<Record<string, string>>({});
  const [deletingApps, setDeletingApps] = useState<Record<string, boolean>>({});
  const [deletedAppIds, setDeletedAppIds] = useState<Set<string>>(new Set());
  const [appDeleteErrors, setAppDeleteErrors] = useState<Record<string, string>>({});
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

  // ── Partners state ─────────────────────────────────────────────
  const [partners, setPartners] = useState<PartnerApplication[]>(initialPartners);
  const [partnerStatusFilter, setPartnerStatusFilter] = useState<PartnerStatus | "all">("all");
  const [partnerTierFilter, setPartnerTierFilter] = useState<PartnerTier | "all">("all");
  const [updatingPartnerId, setUpdatingPartnerId] = useState<string | null>(null);
  const [partnerDecisionNotes, setPartnerDecisionNotes] = useState<Record<string, string>>({});
  const [partnersPage, setPartnersPage] = useState(1);
  const PARTNERS_PER_PAGE = 30;

  useEffect(() => {
    setPartners(initialPartners);
  }, [initialPartners]);

  useEffect(() => {
    setPartnersPage(1);
  }, [partnerStatusFilter, partnerTierFilter]);

  async function handlePartnerDecision(applicationId: string, decision: "approved" | "denied") {
    setUpdatingPartnerId(applicationId);
    try {
      const res = await fetch("/api/admin/partners/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, decision, notes: partnerDecisionNotes[applicationId] }),
      });
      if (res.ok) {
        setPartners((prev) =>
          prev.map((p) => (p.id === applicationId ? { ...p, status: decision } : p))
        );
        // Approving also generates the agreement server-side (agreement_terms,
        // agreement_generated_at) — refresh so the Agreement column reflects
        // that instead of the stale pre-approval values from initialPartners.
        router.refresh();
      }
    } finally {
      setUpdatingPartnerId(null);
    }
  }

  const filteredPartners = useMemo(() => {
    return partners.filter((p) => {
      if (partnerStatusFilter !== "all" && p.status !== partnerStatusFilter) return false;
      if (partnerTierFilter !== "all" && p.tier !== partnerTierFilter) return false;
      return true;
    });
  }, [partners, partnerStatusFilter, partnerTierFilter]);

  const partnersTotalPages = Math.max(1, Math.ceil(filteredPartners.length / PARTNERS_PER_PAGE));
  const paginatedPartners = useMemo(
    () => filteredPartners.slice((partnersPage - 1) * PARTNERS_PER_PAGE, partnersPage * PARTNERS_PER_PAGE),
    [filteredPartners, partnersPage]
  );

  function partnerUploadUrl(path: string): string {
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/partner-uploads/${path}`;
  }

  // ── Referrals state ────────────────────────────────────────────
  const [referrals, setReferrals] = useState<PartnerReferral[]>(initialReferrals);
  const [referralStatusFilter, setReferralStatusFilter] = useState<PartnerReferralStatus | "all">("all");
  const [updatingReferralId, setUpdatingReferralId] = useState<string | null>(null);
  const [referralsPage, setReferralsPage] = useState(1);
  const REFERRALS_PER_PAGE = 30;

  useEffect(() => {
    setReferrals(initialReferrals);
  }, [initialReferrals]);

  useEffect(() => {
    setReferralsPage(1);
  }, [referralStatusFilter]);

  const partnersById = useMemo(() => new Map(partners.map((p) => [p.id, p])), [partners]);

  async function handleReferralStatusChange(referralId: string, status: PartnerReferralStatus) {
    setUpdatingReferralId(referralId);
    try {
      const res = await fetch("/api/admin/partners/referrals/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referralId, status }),
      });
      if (res.ok) {
        setReferrals((prev) => prev.map((r) => (r.id === referralId ? { ...r, status } : r)));
        // Status change may also update the referring partner's bonus
        // discount server-side — refresh so Partners tab reflects it.
        router.refresh();
      }
    } finally {
      setUpdatingReferralId(null);
    }
  }

  const filteredReferrals = useMemo(() => {
    return referrals.filter((r) => referralStatusFilter === "all" || r.status === referralStatusFilter);
  }, [referrals, referralStatusFilter]);

  const referralsTotalPages = Math.max(1, Math.ceil(filteredReferrals.length / REFERRALS_PER_PAGE));
  const paginatedReferrals = useMemo(
    () => filteredReferrals.slice((referralsPage - 1) * REFERRALS_PER_PAGE, referralsPage * REFERRALS_PER_PAGE),
    [filteredReferrals, referralsPage]
  );

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

    const now = Date.now();
    const within = (iso: string, days: number) => now - new Date(iso).getTime() < days * 86400000;

    const changeReqs = revisions.filter((r) => r.kind === "change");
    const aiSpend = (days?: number) =>
      aiUsage
        .filter((u) => days == null || within(u.created_at, days))
        .reduce((s, u) => s + (u.cost_usd ?? 0), 0);

    // ── AI cost (Anthropic) breakdown ──
    const AI_GROUP: Record<string, string> = {
      app_generate: "App builds",
      app_generate_plan: "App builds",
      app_deploy_repair: "App builds",
      app_edit: "Change edits",
      try_recommend: "Recommender",
    };
    const aiRows = aiUsage.map((u) => ({
      cost: u.cost_usd ?? 0,
      at: new Date(u.created_at).getTime(),
      group: AI_GROUP[u.source] ?? "Content & marketing",
    }));
    const aiSum = (pred: (r: (typeof aiRows)[number]) => boolean) =>
      aiRows.filter(pred).reduce((s, r) => s + r.cost, 0);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const aiByGroup: Record<string, number> = {};
    for (const r of aiRows) aiByGroup[r.group] = (aiByGroup[r.group] ?? 0) + r.cost;
    const buildCount = aiUsage.filter((u) => u.source === "app_generate").length;
    const aiByDay: { day: string; cost: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const dayStart = new Date(now - i * 86400000);
      dayStart.setHours(0, 0, 0, 0);
      const from = dayStart.getTime();
      aiByDay.push({
        day: dayStart.toLocaleDateString(undefined, { month: "numeric", day: "numeric" }),
        cost: aiSum((r) => r.at >= from && r.at < from + 86400000),
      });
    }

    return {
      totalUsers: profiles.length,
      totalApps: apps.length,
      liveApps,
      mrr,
      appsThisWeek,
      generating: apps.filter((a) => a.status === "generating").length,
      deploying: apps.filter((a) => a.status === "deploying" || a.status === "ready").length,
      failed: apps.filter((a) => a.status === "failed" || a.status === "deploy_failed").length,

      // Client activity
      changeReqs: changeReqs.length,
      changeReqsWeek: changeReqs.filter((r) => within(r.created_at, 7)).length,
      changeReqsFailed: changeReqs.filter((r) => r.status === "failed").length,
      previews: apps.filter((a) => !a.user_id).length,
      testRuns: apps.filter((a) => a.status === "test_skipped").length,
      recommenderUses: aiUsage.filter((u) => u.source === "try_recommend").length,
      genFailed: apps.filter((a) => a.status === "failed").length,
      deployFailed: apps.filter((a) => a.status === "deploy_failed").length,
      aiSpend7: aiSum((r) => now - r.at < 7 * 86400000),
      aiSpend30: aiSpend(30),
      aiSpendMonth: aiSum((r) => r.at >= monthStart.getTime()),
      aiSpendAll: aiSpend(),
      aiByGroup,
      aiByDay,
      buildCount,
      aiCostPerBuild: buildCount ? (aiByGroup["App builds"] ?? 0) / buildCount : 0,
    };
  }, [apps, profiles, subscriptions, revisions, aiUsage]);

  // ── Build reliability (golden-intake canary) ────────────────────
  const canaryStats = useMemo(() => {
    const now = Date.now();
    const graded = canaryRuns.filter((r) => r.status === "pass" || r.status === "fail");
    const rate = (days: number) => {
      const inWin = graded.filter((r) => now - new Date(r.created_at).getTime() < days * 86400000);
      if (inWin.length === 0) return null;
      return inWin.filter((r) => r.status === "pass").length / inWin.length;
    };
    const durations = graded
      .filter((r) => r.status === "pass" && r.duration_sec)
      .map((r) => r.duration_sec as number);
    const avgSec = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;
    const byKey: Record<string, { pass: number; total: number }> = {};
    for (const r of graded.filter((x) => now - new Date(x.created_at).getTime() < 30 * 86400000)) {
      byKey[r.intake_key] = byKey[r.intake_key] ?? { pass: 0, total: 0 };
      byKey[r.intake_key].total += 1;
      if (r.status === "pass") byKey[r.intake_key].pass += 1;
    }
    // Per-category rate at both windows — the 30d-only byKey above doesn't
    // tell you whether a category is trending up or down.
    const byKeyWindow = (days: number) => {
      const out: Record<string, { pass: number; total: number }> = {};
      for (const r of graded.filter((x) => now - new Date(x.created_at).getTime() < days * 86400000)) {
        out[r.intake_key] = out[r.intake_key] ?? { pass: 0, total: 0 };
        out[r.intake_key].total += 1;
        if (r.status === "pass") out[r.intake_key].pass += 1;
      }
      return out;
    };
    // Consecutive-clean-run streak toward the stabilization plan's "10 green
    // nights" gate. A "run" = one batch of golden intakes fired together
    // (created_at within 5 min of each other) — this counts every trigger,
    // scheduled (0 5 * * * UTC) or manual (workflow_dispatch / by hand), not
    // just calendar nights, so a manual proving run also has to stay clean to
    // keep the streak alive. Only fully-graded batches count; a batch still
    // mid-flight (any row pending) is excluded rather than breaking the streak.
    const BATCH_GAP_MS = 5 * 60_000;
    const byTime = [...canaryRuns].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const batches: { at: string; rows: typeof canaryRuns }[] = [];
    for (const r of byTime) {
      const last = batches[batches.length - 1];
      if (last && new Date(r.created_at).getTime() - new Date(last.at).getTime() <= BATCH_GAP_MS) {
        last.rows.push(r);
        last.at = r.created_at;
      } else {
        batches.push({ at: r.created_at, rows: [r] });
      }
    }
    const gradedBatches = batches
      .filter((b) => b.rows.every((r) => r.status === "pass" || r.status === "fail"))
      .map((b) => ({
        at: b.at,
        clean: b.rows.every((r) => r.status === "pass"),
        n: b.rows.length,
      }));
    let streak = 0;
    for (let i = gradedBatches.length - 1; i >= 0; i--) {
      if (gradedBatches[i].clean) streak += 1;
      else break;
    }
    let longestStreak = 0;
    let running = 0;
    for (const b of gradedBatches) {
      running = b.clean ? running + 1 : 0;
      longestStreak = Math.max(longestStreak, running);
    }

    return {
      rate7: rate(7),
      rate30: rate(30),
      avgMin: avgSec != null ? Math.round(avgSec / 60) : null,
      pending: canaryRuns.filter((r) => r.status === "pending").length,
      byKey,
      byKey7: byKeyWindow(7),
      recent: canaryRuns.slice(0, 12),
      total30: graded.filter((r) => now - new Date(r.created_at).getTime() < 30 * 86400000).length,
      streak,
      longestStreak,
      gradedBatchCount: gradedBatches.length,
      streakGoal: 10,
    };
  }, [canaryRuns]);

  // ── Build outcomes across REAL apps (not the synthetic canary) ──
  // "% complete" and the failure-reason ranking below are the two numbers
  // that say where to spend fix effort next.
  const buildOutcomes = useMemo(() => {
    const now = Date.now();
    const windowed = (days: number | null) =>
      days == null ? apps : apps.filter((a) => now - new Date(a.created_at).getTime() < days * 86400000);
    const summarize = (rows: typeof apps) => {
      const deployed = rows.filter((a) => a.status === "deployed").length;
      const failed = rows.filter((a) => a.status === "failed").length;
      const deployFailed = rows.filter((a) => a.status === "deploy_failed").length;
      const inProgress = rows.filter((a) =>
        ["generating", "ready", "deploying"].includes(a.status),
      ).length;
      const terminal = deployed + failed + deployFailed;
      return {
        total: rows.length,
        deployed,
        failed,
        deployFailed,
        inProgress,
        terminal,
        pctComplete: terminal > 0 ? deployed / terminal : null,
      };
    };
    // Ranked failure reasons across BOTH real apps and canary runs, tagged by
    // source, so you know whether to chase a customer-facing bug or a
    // canary/infra quirk first. Scoped by window — "this month" (30d) is the
    // one to act on; all-time is there for context.
    const countReasons = (days: number | null) => {
      const cutoff = days == null ? null : now - days * 86400000;
      const inWindow = (iso: string) => cutoff == null || new Date(iso).getTime() >= cutoff;
      const reasonCounts = new Map<string, { count: number; real: number; canary: number }>();
      for (const a of apps) {
        if (a.status !== "failed" && a.status !== "deploy_failed") continue;
        if (!inWindow(a.created_at)) continue;
        const reason = a.failure_reason ?? "(unknown)";
        const e = reasonCounts.get(reason) ?? { count: 0, real: 0, canary: 0 };
        e.count += 1;
        e.real += 1;
        reasonCounts.set(reason, e);
      }
      for (const r of canaryRuns) {
        if (r.status !== "fail") continue;
        if (!inWindow(r.created_at)) continue;
        const reason = r.failure_reason ?? "(unknown)";
        const e = reasonCounts.get(reason) ?? { count: 0, real: 0, canary: 0 };
        e.count += 1;
        e.canary += 1;
        reasonCounts.set(reason, e);
      }
      const total = [...reasonCounts.values()].reduce((s, v) => s + v.count, 0);
      const ranked = [...reasonCounts.entries()]
        .map(([reason, v]) => ({ reason, ...v, pct: total > 0 ? v.count / total : 0 }))
        .sort((a, b) => b.count - a.count);
      return { ranked, total };
    };
    const reasons30 = countReasons(30);
    const reasonsAll = countReasons(null);
    return {
      all: summarize(windowed(null)),
      d30: summarize(windowed(30)),
      d7: summarize(windowed(7)),
      topReasons: reasons30.ranked,
      totalFailures: reasons30.total,
      topReasonsAll: reasonsAll.ranked,
      totalFailuresAll: reasonsAll.total,
    };
  }, [apps, canaryRuns]);

  // ── Cost per build (actual AI + infra estimate) ────────────────
  const buildCost = useMemo(() => {
    const perBuild = new Map<string, number>();
    for (const u of aiUsage) {
      if (!u.app_id) continue;
      perBuild.set(u.app_id, (perBuild.get(u.app_id) ?? 0) + (u.cost_usd ?? 0));
    }
    const costs = [...perBuild.values()].sort((a, b) => a - b);
    const n = costs.length;
    const pct = (p: number) => (n === 0 ? 0 : costs[Math.min(n - 1, Math.floor(p * n))]);
    const avgAi = n === 0 ? 0 : costs.reduce((a, b) => a + b, 0) / n;
    const infra = estimatedBuildInfraUsd();
    // Attributed-build total AI spend as a share of ALL AI spend — shows
    // how much of the bill is builds vs. everything else.
    const allAi = aiUsage.reduce((s, u) => s + (u.cost_usd ?? 0), 0);
    const buildsAi = costs.reduce((a, b) => a + b, 0);
    return {
      n,
      avgAi,
      medianAi: pct(0.5),
      p90Ai: pct(0.9),
      maxAi: n === 0 ? 0 : costs[n - 1],
      infra,
      totalAvg: avgAi + infra,
      totalP90: pct(0.9) + infra,
      buildShareOfAi: allAi > 0 ? buildsAi / allAi : 0,
      perBuild,
    };
  }, [aiUsage]);

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
      if (deletedAppIds.has(a.id)) return false;
      const email = (a.user_id && userEmails[a.user_id]) ?? "";
      const matchesSearch =
        !q ||
        a.name.toLowerCase().includes(q) ||
        email.toLowerCase().includes(q) ||
        a.category.includes(q);
      const matchesStatus = appStatusFilter === "all" || a.status === appStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [apps, appSearch, appStatusFilter, userEmails, deletedAppIds]);

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

  // ── Post a customer-facing build update ───────────────────────
  async function handlePostNotice(appId: string, current: string | null) {
    const next = window.prompt(
      "Update the customer sees on /generate and their dashboard (blank to clear):",
      current ?? "",
    );
    if (next === null) return;
    setNoticeMessages((m) => ({ ...m, [appId]: "Saving…" }));
    try {
      const res = await fetch("/api/admin/build-notice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId, notice: next }),
      });
      const data = await res.json();
      setNoticeMessages((m) => ({
        ...m,
        [appId]: res.ok ? "Update posted ✓" : data.error ?? "Failed",
      }));
    } catch {
      setNoticeMessages((m) => ({ ...m, [appId]: "Network error" }));
    }
  }

  // ── Delete app action ─────────────────────────────────────────
  async function handleDeleteApp(appId: string, name: string) {
    const confirmed = window.confirm(
      `Permanently delete "${name}"?\n\nThis deletes its Vercel project, its tenant database schema (ALL of the app's data), and its Vision Workx records. This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeletingApps((d) => ({ ...d, [appId]: true }));
    setAppDeleteErrors((e) => ({ ...e, [appId]: "" }));
    try {
      const res = await fetch("/api/admin/delete-app", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId }),
      });
      const data = await res.json();
      if (res.ok) {
        setDeletedAppIds((s) => new Set(s).add(appId));
        router.refresh();
      } else {
        setAppDeleteErrors((e) => ({ ...e, [appId]: data.error ?? "Delete failed" }));
      }
    } catch {
      setAppDeleteErrors((e) => ({ ...e, [appId]: "Network error" }));
    } finally {
      setDeletingApps((d) => ({ ...d, [appId]: false }));
    }
  }

  // ── Stripe Connect test-mode toggle ───────────────────────────
  const [paymentsTestMode, setPaymentsTestMode] = useState<Record<string, boolean>>(
    () => Object.fromEntries(apps.map((a) => [a.id, !!a.payments_test_mode])),
  );
  const [togglingTest, setTogglingTest] = useState<Record<string, boolean>>({});

  async function handleTogglePaymentsTest(appId: string) {
    const next = !paymentsTestMode[appId];
    setTogglingTest((t) => ({ ...t, [appId]: true }));
    try {
      const res = await fetch("/api/admin/payments-test-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId, enabled: next }),
      });
      if (res.ok) {
        setPaymentsTestMode((m) => ({ ...m, [appId]: next }));
      }
    } catch {
      /* leave as-is */
    } finally {
      setTogglingTest((t) => ({ ...t, [appId]: false }));
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
    <div className="min-h-screen bg-white">
      {/* Header */}
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
          <span className="text-xs bg-black/20 px-2 py-0.5 rounded-full font-medium">Admin</span>
        </div>
        <div className="flex items-center gap-4 flex-wrap justify-end">
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
              autoRefresh ? "bg-green-500/20 text-green-300" : "bg-black/10 text-white/70 hover:text-white"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? "bg-green-400 animate-pulse" : "bg-black/40"}`} />
            Auto-refresh {autoRefresh ? "on" : "off"}
          </button>
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
          <Link href="/admin/ops" className="text-xs text-white/70 hover:text-white transition-colors">
            Ops →
          </Link>
          <Link href="/admin/dev-activity" className="text-xs text-white/70 hover:text-white transition-colors">
            Dev Activity →
          </Link>
          <span className="hidden sm:inline text-white/20">|</span>
          <Link href="/dashboard" className="text-xs text-white/70 hover:text-white transition-colors">
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-wrap items-center gap-2 mb-6 pb-4 border-b border-zinc-200">
          <h2 className="text-sm font-bold text-white bg-[#1A3A5C] rounded-full px-4 py-1 w-28 text-center shrink-0">
            Products
          </h2>
          <a
            href="/api/admin/sso/issue?target=chorebit"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-500 hover:border-zinc-400"
          >
            Chorebit →
          </a>
          <a
            href="/api/admin/sso/issue?target=feelflow"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-500 hover:border-zinc-400"
          >
            FeelFlow →
          </a>
          <a
            href="/api/admin/sso/issue?target=mindbit"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-500 hover:border-zinc-400"
          >
            MindBit →
          </a>
          <a
            href="/api/admin/sso/issue?target=sanctum"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-500 hover:border-zinc-400"
          >
            Sanctum →
          </a>
          <a
            href="/api/admin/sso/issue?target=proactive"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-500 hover:border-zinc-400"
          >
            Proactive →
          </a>
          <a
            href="/api/admin/sso/issue?target=revalor"
            className="rounded-lg border border-[#B8860B]/50 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:border-[#B8860B] hover:bg-[#B8860B]/5"
          >
            Revalor Admin →
          </a>
        </div>


        {/* Page title */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900">Vision Workx Management Dashboard</h1>
          <p className="text-zinc-500 text-sm mt-1">All customers, apps, and deployments across Vision Workx</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white border border-[#B8860B] rounded-xl p-1 w-full sm:w-fit overflow-x-auto">
          {(["overview", "apps", "users", "payments", "automations", "leads", "partners", "referrals"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 sm:px-5 py-2 rounded-lg text-sm font-medium capitalize transition-colors shrink-0 ${
                tab === t
                  ? "bg-[#1A3A5C] text-white"
                  : "text-zinc-500 hover:text-[#1A3A5C]"
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
            <div className="bg-white rounded-2xl border border-[#B8860B] p-6">
              <h2 className="font-semibold text-zinc-900 mb-4">App Pipeline Status</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <PipelineStat label="Generating" count={stats.generating} color="amber" />
                <PipelineStat label="Deploying" count={stats.deploying} color="blue" />
                <PipelineStat label="Live" count={stats.liveApps} color="green" />
                <PipelineStat label="Failed" count={stats.failed} color="red" />
              </div>
            </div>

            {/* Client activity */}
            <div className="bg-white rounded-2xl border border-[#B8860B] p-6">
              <h2 className="font-semibold text-zinc-900 mb-4">Client Activity</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard
                  label="Change requests"
                  value={stats.changeReqs}
                  sub={`${stats.changeReqsWeek} this week · ${stats.changeReqsFailed} failed`}
                />
                <StatCard
                  label="/try previews"
                  value={stats.previews}
                  sub={`${stats.testRuns} test-mode run${stats.testRuns === 1 ? "" : "s"}`}
                />
                <StatCard label="Recommender uses" value={stats.recommenderUses} sub={`${guidedSessions} guided session${guidedSessions === 1 ? "" : "s"}`} />
                <StatCard
                  label="AI spend (30d)"
                  value={`$${stats.aiSpend30.toFixed(2)}`}
                  sub={`$${stats.aiSpendAll.toFixed(2)} all-time`}
                  accent="blue"
                />
              </div>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <PipelineStat label="Generate failed" count={stats.genFailed} color="red" />
                <PipelineStat label="Deploy failed" count={stats.deployFailed} color="red" />
                <PipelineStat label="Change failed" count={stats.changeReqsFailed} color="red" />
              </div>
            </div>

            {/* AI cost (Anthropic) */}
            <div className="bg-white rounded-2xl border border-[#B8860B] p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-zinc-900">AI Cost (Anthropic)</h2>
                <a
                  href="https://console.anthropic.com/settings/usage"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-600 hover:underline"
                >
                  Anthropic console →
                </a>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard label="This month" value={`$${stats.aiSpendMonth.toFixed(2)}`} accent="blue" />
                <StatCard label="Last 7 days" value={`$${stats.aiSpend7.toFixed(2)}`} />
                <StatCard label="Last 30 days" value={`$${stats.aiSpend30.toFixed(2)}`} />
                <StatCard
                  label="All-time"
                  value={`$${stats.aiSpendAll.toFixed(2)}`}
                  sub={`${stats.buildCount} build${stats.buildCount === 1 ? "" : "s"} · $${stats.aiCostPerBuild.toFixed(2)}/build`}
                />
              </div>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                {Object.entries(stats.aiByGroup)
                  .sort((a, b) => b[1] - a[1])
                  .map(([g, c]) => (
                    <StatCard key={g} label={g} value={`$${c.toFixed(2)}`} />
                  ))}
              </div>
              <div className="mt-5">
                <p className="text-xs text-zinc-500 mb-2">Daily spend · last 14 days</p>
                <div className="flex items-end gap-1 h-20">
                  {stats.aiByDay.map((d) => {
                    const max = Math.max(...stats.aiByDay.map((x) => x.cost), 0.01);
                    return (
                      <div
                        key={d.day}
                        className="flex-1 flex flex-col items-center gap-1"
                        title={`${d.day}: $${d.cost.toFixed(2)}`}
                      >
                        <div
                          className="w-full rounded-t bg-blue-500/80"
                          style={{ height: `${Math.max(2, (d.cost / max) * 100)}%` }}
                        />
                        <span className="text-[9px] text-zinc-400">{d.day}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="mt-3 text-xs text-zinc-400">
                Computed from logged token usage at Anthropic list prices. Does not reflect your
                account credit balance — check the Anthropic console for that.
              </p>
            </div>

            {/* Build reliability */}
            <div className="bg-white rounded-2xl border border-[#B8860B] p-6">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-semibold text-zinc-900">Build Reliability</h2>
                <span className="text-xs text-zinc-400">
                  golden-intake canary · {canaryStats.total30} graded in 30d
                  {canaryStats.pending > 0 ? ` · ${canaryStats.pending} running` : ""}
                </span>
              </div>
              <p className="text-xs text-zinc-500 mb-4">
                Synthetic first builds run daily through the real generate → deploy pipeline. This
                is the number that says whether the product is stable.
              </p>

              {/* Streak toward the stabilization plan's "10 green nights" gate.
                  Counts every fully-graded run (scheduled or manual) where all
                  5 golden categories passed, consecutively from the most
                  recent. Breaks on the first red run. */}
              <div
                className={`mb-5 rounded-xl border p-4 ${
                  canaryStats.streak >= canaryStats.streakGoal
                    ? "border-green-300 bg-green-50"
                    : "border-amber-300 bg-amber-50"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-zinc-800">
                    Green-run streak:{" "}
                    <span
                      className={
                        canaryStats.streak >= canaryStats.streakGoal
                          ? "text-green-700"
                          : "text-amber-700"
                      }
                    >
                      {canaryStats.streak} / {canaryStats.streakGoal}
                    </span>
                  </p>
                  <span className="text-xs text-zinc-500">
                    longest so far: {canaryStats.longestStreak} · {canaryStats.gradedBatchCount} graded runs total
                  </span>
                </div>
                <div className="w-full bg-white rounded-full h-2 overflow-hidden border border-zinc-200">
                  <div
                    className={`h-2 rounded-full ${
                      canaryStats.streak >= canaryStats.streakGoal ? "bg-green-500" : "bg-amber-400"
                    }`}
                    style={{
                      width: `${Math.min(100, Math.round((canaryStats.streak / canaryStats.streakGoal) * 100))}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-zinc-500 mt-2">
                  {canaryStats.streak >= canaryStats.streakGoal
                    ? "Threshold met — this is the plan's gate to lift the build freeze (see docs/stabilization-plan.md)."
                    : "One red run resets this to 0. Counts every trigger — scheduled and manual."}
                </p>
              </div>

              {canaryStats.total30 === 0 ? (
                <p className="text-sm text-zinc-500">No runs graded yet — first results land after tonight&apos;s cron.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <StatCard
                      label="Success rate (7d)"
                      value={canaryStats.rate7 == null ? "—" : `${Math.round(canaryStats.rate7 * 100)}%`}
                      accent={
                        canaryStats.rate7 == null
                          ? undefined
                          : canaryStats.rate7 >= 0.9
                            ? "green"
                            : "red"
                      }
                    />
                    <StatCard
                      label="Success rate (30d)"
                      value={canaryStats.rate30 == null ? "—" : `${Math.round(canaryStats.rate30 * 100)}%`}
                    />
                    <StatCard
                      label="Avg build time"
                      value={canaryStats.avgMin == null ? "—" : `${canaryStats.avgMin} min`}
                    />
                  </div>
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Object.entries(canaryStats.byKey).map(([k, v]) => {
                      const w7 = canaryStats.byKey7[k];
                      return (
                        <div key={k} className="rounded-xl border border-zinc-200 p-3">
                          <p className="text-xs text-zinc-500">{k}</p>
                          <p
                            className={`text-lg font-bold ${
                              v.pass === v.total ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {v.pass}/{v.total}
                            <span className="text-xs font-normal text-zinc-400 ml-1">30d</span>
                          </p>
                          {w7 && (
                            <p className="text-xs text-zinc-400">
                              {w7.pass}/{w7.total} last 7d
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-zinc-400">
                        <tr>
                          <th className="text-left font-medium py-1">When</th>
                          <th className="text-left font-medium py-1">Intake</th>
                          <th className="text-left font-medium py-1">Result</th>
                          <th className="text-left font-medium py-1">Detail</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {canaryStats.recent.map((r, i) => (
                          <tr key={i}>
                            <td className="py-1.5 text-zinc-500 whitespace-nowrap">
                              {new Date(r.created_at).toLocaleDateString()}{" "}
                              {new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </td>
                            <td className="py-1.5 text-zinc-700">{r.intake_key}</td>
                            <td className="py-1.5">
                              <span
                                className={`font-semibold ${
                                  r.status === "pass"
                                    ? "text-green-600"
                                    : r.status === "fail"
                                      ? "text-red-600"
                                      : "text-zinc-400"
                                }`}
                              >
                                {r.status}
                              </span>
                            </td>
                            <td className="py-1.5 text-zinc-500">
                              {r.status === "pass"
                                ? r.duration_sec
                                  ? `${Math.round(r.duration_sec / 60)} min`
                                  : ""
                                : r.failure_reason ?? ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* Build outcomes + failure reasons — where to focus fix effort */}
            <div className="bg-white rounded-2xl border border-[#B8860B] p-6">
              <h2 className="font-semibold text-zinc-900 mb-1">Build Outcomes</h2>
              <p className="text-xs text-zinc-500 mb-4">
                Every real app that&apos;s ever been built (not the synthetic canary). % complete
                only counts apps that reached a terminal state — still-building apps aren&apos;t
                penalized while they&apos;re in flight.
              </p>
              <div className="overflow-x-auto mb-5">
                <table className="w-full text-sm">
                  <thead className="text-zinc-400">
                    <tr>
                      <th className="text-left font-medium py-1"></th>
                      <th className="text-right font-medium py-1">Total</th>
                      <th className="text-right font-medium py-1">Deployed</th>
                      <th className="text-right font-medium py-1">Failed</th>
                      <th className="text-right font-medium py-1">Deploy failed</th>
                      <th className="text-right font-medium py-1">In progress</th>
                      <th className="text-right font-medium py-1">% complete</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {(
                      [
                        ["Last 7 days", buildOutcomes.d7],
                        ["Last 30 days", buildOutcomes.d30],
                        ["All time", buildOutcomes.all],
                      ] as const
                    ).map(([label, s]) => (
                      <tr key={label}>
                        <td className="py-1.5 text-zinc-600 font-medium whitespace-nowrap">{label}</td>
                        <td className="py-1.5 text-right text-zinc-700">{s.total}</td>
                        <td className="py-1.5 text-right text-green-600 font-medium">{s.deployed}</td>
                        <td className="py-1.5 text-right text-red-600">{s.failed}</td>
                        <td className="py-1.5 text-right text-red-600">{s.deployFailed}</td>
                        <td className="py-1.5 text-right text-amber-600">{s.inProgress}</td>
                        <td className="py-1.5 text-right font-semibold">
                          {s.pctComplete == null ? (
                            <span className="text-zinc-300">—</span>
                          ) : (
                            <span className={s.pctComplete >= 0.9 ? "text-green-600" : "text-red-600"}>
                              {Math.round(s.pctComplete * 100)}%
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-zinc-600">
                  Top failure reasons this month — fix the biggest one first
                </p>
                <span className="text-xs text-zinc-400">
                  {buildOutcomes.totalFailures} this month · {buildOutcomes.totalFailuresAll} all-time
                </span>
              </div>
              {buildOutcomes.topReasons.length === 0 ? (
                <p className="text-sm text-zinc-500">No failures this month. 🎉</p>
              ) : (
                <div className="space-y-2">
                  {buildOutcomes.topReasons.slice(0, 8).map((r) => (
                    <div key={r.reason} className="flex items-center gap-3">
                      <span className="text-xs text-zinc-600 w-36 shrink-0 truncate" title={r.reason}>
                        {r.reason}
                      </span>
                      <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
                        <div
                          className="h-2 bg-red-400 rounded-full"
                          style={{ width: `${Math.max(4, Math.round(r.pct * 100))}%` }}
                        />
                      </div>
                      <span className="text-xs text-zinc-500 w-10 text-right shrink-0">
                        {Math.round(r.pct * 100)}%
                      </span>
                      <span className="text-xs text-zinc-400 w-28 text-right shrink-0">
                        {r.real > 0 && `${r.real} real`}
                        {r.real > 0 && r.canary > 0 && " · "}
                        {r.canary > 0 && `${r.canary} canary`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cost per build / unit economics */}
            <div className="bg-white rounded-2xl border border-[#B8860B] p-6">
              <h2 className="font-semibold text-zinc-900 mb-1">Cost per Build</h2>
              <p className="text-xs text-zinc-500 mb-4">
                What it actually costs to produce one app. AI is measured; infra is an estimate;
                ongoing hosting is not in here (see bottom). Use this to sanity-check plan pricing.
              </p>

              {buildCost.n === 0 ? (
                <p className="text-sm text-zinc-500">
                  No builds have per-app AI cost attributed yet — starts accruing on the next build.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <StatCard
                      label="AI / build (avg)"
                      value={`$${buildCost.avgAi.toFixed(2)}`}
                      sub={`measured · ${buildCost.n} build${buildCost.n === 1 ? "" : "s"}`}
                      accent="blue"
                    />
                    <StatCard label="AI / build (median)" value={`$${buildCost.medianAi.toFixed(2)}`} />
                    <StatCard
                      label="AI / build (p90)"
                      value={`$${buildCost.p90Ai.toFixed(2)}`}
                      sub={`worst seen $${buildCost.maxAi.toFixed(2)}`}
                    />
                    <StatCard
                      label="Builds share of AI bill"
                      value={`${Math.round(buildCost.buildShareOfAi * 100)}%`}
                      sub="rest is content/marketing"
                    />
                  </div>

                  <div className="mt-4 rounded-xl border border-zinc-200 p-4">
                    <p className="text-xs font-semibold text-zinc-600 mb-2">
                      Fully-loaded cost to produce one build
                    </p>
                    <table className="text-sm">
                      <tbody>
                        <tr>
                          <td className="py-0.5 pr-6 text-zinc-500">AI (measured, avg)</td>
                          <td className="py-0.5 font-medium">${buildCost.avgAi.toFixed(2)}</td>
                        </tr>
                        <tr>
                          <td className="py-0.5 pr-6 text-zinc-500">Our compute (est.)</td>
                          <td className="py-0.5">${BUILD_COST_ESTIMATES.ourComputeUsd.toFixed(2)}</td>
                        </tr>
                        <tr>
                          <td className="py-0.5 pr-6 text-zinc-500">Customer Vercel build (est.)</td>
                          <td className="py-0.5">${BUILD_COST_ESTIMATES.vercelBuildUsd.toFixed(2)}</td>
                        </tr>
                        <tr>
                          <td className="py-0.5 pr-6 text-zinc-500">Emails (est.)</td>
                          <td className="py-0.5">${BUILD_COST_ESTIMATES.emailUsd.toFixed(3)}</td>
                        </tr>
                        <tr className="border-t border-zinc-200">
                          <td className="py-1 pr-6 font-semibold text-zinc-800">Total / build (avg)</td>
                          <td className="py-1 font-bold text-zinc-900">
                            ${buildCost.totalAvg.toFixed(2)}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-0.5 pr-6 text-zinc-500">Total / build (p90)</td>
                          <td className="py-0.5">${buildCost.totalP90.toFixed(2)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs font-semibold text-zinc-600 mb-2">
                      Against plan pricing (build cost is one-time)
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-zinc-400">
                          <tr>
                            <th className="text-left font-medium py-1">Plan</th>
                            <th className="text-left font-medium py-1">Price/mo</th>
                            <th className="text-left font-medium py-1">Build cost recouped in</th>
                            <th className="text-left font-medium py-1">First-month gross</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {(["starter", "growth", "pro"] as const).map((p) => {
                            const price = PLAN_MRR[p];
                            const days = Math.ceil((buildCost.totalAvg / price) * 30);
                            const firstMonth = price - buildCost.totalAvg;
                            return (
                              <tr key={p}>
                                <td className="py-1.5 capitalize text-zinc-700">{p}</td>
                                <td className="py-1.5">${price}</td>
                                <td className="py-1.5 text-zinc-600">
                                  {days <= 1 ? "< 1 day" : `${days} days`}
                                </td>
                                <td
                                  className={`py-1.5 font-semibold ${
                                    firstMonth > 0 ? "text-green-600" : "text-red-600"
                                  }`}
                                >
                                  ${firstMonth.toFixed(2)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3">
                    <p className="text-xs font-semibold text-amber-800 mb-1">
                      Not in the number above — account for these separately:
                    </p>
                    <ul className="text-xs text-amber-800 space-y-0.5 list-disc pl-4">
                      {UNMODELED_COSTS.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-amber-700/80 mt-2">
                      Infra estimates live in <code>lib/apps/buildCost.ts</code> — tune them from real
                      Vercel/Resend invoices.
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Recent apps */}
            <div className="bg-white rounded-2xl border border-[#B8860B] overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
                <h2 className="font-semibold text-zinc-900">Recent Apps</h2>
                <button onClick={() => setTab("apps")} className="text-xs text-blue-600 hover:underline">
                  View all →
                </button>
              </div>
              <AppTable
                apps={apps.filter((a) => !deletedAppIds.has(a.id)).slice(0, 10)}
                userEmails={userEmails}
                redeploying={redeploying}
                redeployMessages={redeployMessages}
                onRedeploy={handleRedeploy}
                noticeMessages={noticeMessages}
                onPostNotice={handlePostNotice}
                deletingApps={deletingApps}
                appDeleteErrors={appDeleteErrors}
                onDeleteApp={handleDeleteApp}
                paymentsTestMode={paymentsTestMode}
                togglingTest={togglingTest}
                onTogglePaymentsTest={handleTogglePaymentsTest}
                aiCostByApp={buildCost.perBuild}
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
                className="flex-1 border border-[#B8860B] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20"
              />
              <select
                value={appStatusFilter}
                onChange={(e) => setAppStatusFilter(e.target.value as AppStatus | "all")}
                className="border border-[#B8860B] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20 bg-white"
              >
                <option value="all">All statuses</option>
                {(Object.keys(STATUS_STYLE) as AppStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_STYLE[s].label}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-zinc-500">{filteredApps.length} app{filteredApps.length !== 1 ? "s" : ""}</p>
            <div className="bg-white rounded-2xl border border-[#B8860B] overflow-hidden">
              <AppTable
                apps={paginatedApps}
                userEmails={userEmails}
                redeploying={redeploying}
                redeployMessages={redeployMessages}
                onRedeploy={handleRedeploy}
                noticeMessages={noticeMessages}
                onPostNotice={handlePostNotice}
                deletingApps={deletingApps}
                appDeleteErrors={appDeleteErrors}
                onDeleteApp={handleDeleteApp}
                paymentsTestMode={paymentsTestMode}
                togglingTest={togglingTest}
                onTogglePaymentsTest={handleTogglePaymentsTest}
                aiCostByApp={buildCost.perBuild}
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
              className="w-full sm:w-96 border border-[#B8860B] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20"
            />
            <p className="text-xs text-zinc-500">{filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""}</p>
            <div className="bg-white rounded-2xl border border-[#B8860B] overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-zinc-100">
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
                <tbody className="divide-y divide-zinc-100">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-zinc-500">
                        No users found
                      </td>
                    </tr>
                  ) : (
                    paginatedUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-zinc-900">{u.email || "—"}</div>
                          {(u.full_name || u.company_name) && (
                            <div className="text-xs text-zinc-500">
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
                          <span className="text-zinc-900 font-medium">{u.appCount}</span>
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
                              "bg-zinc-100 text-zinc-600"
                            }`}>
                              {u.sub.status}
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-500">No subscription</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-zinc-500 text-xs">
                          {u.sub?.current_period_end
                            ? new Date(u.sub.current_period_end).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
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
                                  className="text-xs font-medium text-zinc-500 hover:text-zinc-900 hover:underline disabled:opacity-50 disabled:no-underline"
                                >
                                  {revokingBeta[u.id] ? "Revoking…" : "Revoke"}
                                </button>
                              </>
                            ) : !u.sub || (u.sub.status !== "active" && u.sub.status !== "trialing") ? (
                              <button
                                onClick={() => handleGrantBetaAccess(u.id, u.email)}
                                disabled={grantingBeta[u.id]}
                                className="text-xs font-medium text-sky-600 hover:text-sky-700 hover:underline disabled:opacity-50 disabled:no-underline"
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
                            <div className="text-[11px] text-red-600 mt-0.5">{grantErrors[u.id]}</div>
                          )}
                          {revokeErrors[u.id] && (
                            <div className="text-[11px] text-red-600 mt-0.5">{revokeErrors[u.id]}</div>
                          )}
                          {deleteErrors[u.id] && (
                            <div className="text-[11px] text-red-600 mt-0.5">{deleteErrors[u.id]}</div>
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
              <div className="text-center py-16 text-zinc-500 text-sm animate-pulse">Loading payments from Stripe…</div>
            )}
            {paymentsError && (
              <div className="text-center py-16 text-red-600 text-sm">{paymentsError}</div>
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
                    className="flex-1 border border-[#B8860B] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20"
                  />
                  <select
                    value={paymentStatusFilter}
                    onChange={(e) => setPaymentStatusFilter(e.target.value as PaymentRow["status"] | "all")}
                    className="border border-[#B8860B] rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20"
                  >
                    <option value="all">All statuses</option>
                    <option value="paid">Paid</option>
                    <option value="open">Open / Failed</option>
                    <option value="void">Void</option>
                    <option value="uncollectible">Uncollectible</option>
                  </select>
                </div>

                {/* Table */}
                <div className="bg-white rounded-2xl border border-[#B8860B] overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-zinc-100">
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
                    <tbody className="divide-y divide-zinc-100">
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
                            : "bg-zinc-100 text-zinc-600";
                          const amount = (p.amount / 100).toLocaleString("en-US", { style: "currency", currency: p.currency.toUpperCase() });
                          return (
                            <tr key={p.id} className={`hover:bg-slate-50 ${isFailed ? "bg-red-50" : ""}`}>
                              <td className="px-4 py-3">
                                <div className="font-medium text-zinc-900">{p.customerEmail}</div>
                                {p.customerName && <div className="text-xs text-zinc-500">{p.customerName}</div>}
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs text-zinc-600">{p.plan ?? "—"}</span>
                              </td>
                              <td className="px-4 py-3 font-semibold text-zinc-900">{amount}</td>
                              <td className="px-4 py-3">
                                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusCls}`}>
                                  {statusLabel}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                                {new Date(p.created * 1000).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-3 text-zinc-500 text-xs">
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
                                      className="text-xs text-blue-600 hover:underline">View</a>
                                  )}
                                  {p.pdfUrl && (
                                    <a href={p.pdfUrl} target="_blank" rel="noreferrer"
                                      className="text-xs text-zinc-500 hover:underline">PDF</a>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      {payments.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-center py-12 text-zinc-500">
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
            <div className="bg-white rounded-2xl border border-[#B8860B] overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-100">
                <h2 className="font-semibold text-zinc-900">App Instrumentation</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Whether emit_automation_event is actually attached in each app&apos;s tenant schema
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-zinc-100">
                    <tr>
                      <Th>App</Th>
                      <Th>Status</Th>
                      <Th>Instrumented</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {apps.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="text-center py-12 text-zinc-500">
                          No apps found
                        </td>
                      </tr>
                    ) : (
                      apps.map((app) => (
                        <tr key={app.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{CATEGORY_ICONS[app.category]}</span>
                              <div>
                                <div className="font-medium text-zinc-900">{app.name}</div>
                                <div className="text-xs text-zinc-500 capitalize">{app.category}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${(STATUS_STYLE[app.status] ?? { cls: "bg-zinc-100 text-zinc-600" }).cls}`}>
                              {(STATUS_STYLE[app.status] ?? { label: app.status }).label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {instrumentedSet.has(app.id) ? (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Yes</span>
                            ) : (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">No</span>
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
            <div className="bg-white rounded-2xl border border-[#B8860B] overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-100">
                <h2 className="font-semibold text-zinc-900">Recent Events</h2>
                <p className="text-xs text-zinc-500 mt-0.5">Last {automationEvents.length} events across all apps</p>
              </div>
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-zinc-100 sticky top-0">
                    <tr>
                      <Th>Time</Th>
                      <Th>App</Th>
                      <Th>Event</Th>
                      <Th>Delivered</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {paginatedEvents.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-12 text-zinc-500">
                          No events recorded yet
                        </td>
                      </tr>
                    ) : (
                      paginatedEvents.map((event) => {
                        const app = apps.find((a) => a.id === event.app_id);
                        const label = semanticEventLabel(app?.category, event.table_name, event.operation);
                        return (
                          <tr key={event.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                              {new Date(event.created_at).toLocaleString()}
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-zinc-900 font-medium">{app?.name ?? event.app_id.slice(0, 8) + "…"}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded">{label}</span>
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
            <div className="bg-white rounded-2xl border border-[#B8860B] p-6">
              <h2 className="font-semibold text-zinc-900 mb-1">Find Leads</h2>
              <p className="text-xs text-zinc-500 mb-4">Searches OpenStreetMap around a location and scores every business found.</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder="City, state or ZIP (e.g. Charlotte, NC)"
                  value={leadSearchLocation}
                  onChange={(e) => setLeadSearchLocation(e.target.value)}
                  className="flex-1 border border-[#B8860B] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20"
                />
                <select
                  value={leadSearchRadius}
                  onChange={(e) => setLeadSearchRadius(Number(e.target.value))}
                  className="border border-[#B8860B] rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20"
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
              {leadSearchError && <p className="text-xs text-red-600 mt-2">{leadSearchError}</p>}
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
                className="border border-[#B8860B] rounded-xl px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20"
              >
                <option value="all">All statuses</option>
                {(["new", "contacted", "responded", "qualified", "converted", "dead"] as LeadStatus[]).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <select
                value={leadCategoryFilter}
                onChange={(e) => setLeadCategoryFilter(e.target.value)}
                className="border border-[#B8860B] rounded-xl px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20"
              >
                <option value="all">All categories</option>
                {leadCategories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select
                value={leadLanguageFilter}
                onChange={(e) => setLeadLanguageFilter(e.target.value as LeadLanguage | "all")}
                className="border border-[#B8860B] rounded-xl px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20"
              >
                <option value="all">All languages</option>
                <option value="en">English</option>
                <option value="es">Spanish</option>
              </select>
              <select
                value={leadWebsiteFilter}
                onChange={(e) => setLeadWebsiteFilter(e.target.value as "all" | "yes" | "no")}
                className="border border-[#B8860B] rounded-xl px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20"
              >
                <option value="all">Website: all</option>
                <option value="yes">Has website</option>
                <option value="no">No website</option>
              </select>
              <select
                value={leadEmailFilter}
                onChange={(e) => setLeadEmailFilter(e.target.value as "all" | "yes" | "no")}
                className="border border-[#B8860B] rounded-xl px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20"
              >
                <option value="all">Email: all</option>
                <option value="yes">Has email</option>
                <option value="no">No email</option>
              </select>
              <div className="flex items-center gap-2 text-sm text-zinc-600">
                <span>Min score</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={leadMinScore}
                  onChange={(e) => setLeadMinScore(Number(e.target.value))}
                  className="w-20 border border-[#B8860B] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20"
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
                className="text-xs font-semibold px-4 py-2 rounded-xl border border-[#B8860B] text-zinc-700 hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                ⬇ Export CSV ({filteredLeads.length})
              </button>
            </div>
            {emailSendResult && <p className="text-xs text-green-600">{emailSendResult}</p>}

            {/* Table */}
            <div className="bg-white rounded-2xl border border-[#B8860B] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-zinc-100">
                    <tr>
                      <Th>
                        <input
                          type="checkbox"
                          checked={filteredLeads.length > 0 && filteredLeads.every((l) => selectedLeadIds.has(l.id))}
                          onChange={toggleSelectAllFiltered}
                          className="rounded border-zinc-300"
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
                  <tbody className="divide-y divide-zinc-100">
                    {paginatedLeads.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="text-center py-12 text-zinc-500">
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
                          "bg-zinc-100 text-zinc-600";
                        return (
                          <tr key={lead.id} className="hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={selectedLeadIds.has(lead.id)}
                                onChange={() => toggleLeadSelected(lead.id)}
                                className="rounded border-zinc-300"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-zinc-900">{lead.business_name}</div>
                              <div className="text-xs text-zinc-500">{lead.address ?? "—"}</div>
                            </td>
                            <td className="px-4 py-3 text-zinc-600 text-xs">{lead.industry_category ?? "—"}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                                lead.detected_language === "es" ? "bg-violet-100 text-violet-700" : "bg-zinc-100 text-zinc-600"
                              }`}>
                                {lead.detected_language === "es" ? "ES" : "EN"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${bucketCls}`}>
                                {lead.final_score}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-zinc-600 whitespace-nowrap">
                              {lead.yelp_rating != null ? (
                                <span>★{lead.yelp_rating.toFixed(1)} ({lead.yelp_review_count ?? 0})</span>
                              ) : (
                                <span className="text-zinc-600">—</span>
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
                                <span className="text-xs text-red-600">✗ No</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-zinc-600 whitespace-nowrap">
                              {lead.distance_miles != null ? `${lead.distance_miles} mi` : <span className="text-zinc-600">—</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-zinc-600">{lead.phone ?? <span className="text-zinc-600">—</span>}</td>
                            <td className="px-4 py-3 text-xs text-zinc-600">
                              {lead.email ? (
                                <a
                                  href={`mailto:${lead.email}`}
                                  className="text-green-600 hover:underline block max-w-[180px] truncate"
                                  title={lead.email}
                                >
                                  {lead.email}
                                </a>
                              ) : (
                                <span className="text-zinc-600">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={lead.status}
                                disabled={updatingLeadId === lead.id}
                                onChange={(e) => handleLeadStatusChange(lead.id, e.target.value as LeadStatus)}
                                className="text-xs border border-[#B8860B] rounded-lg px-2 py-1 bg-white disabled:opacity-50"
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
                <div className="bg-white border border-[#B8860B] rounded-2xl p-6 w-full max-w-lg">
                  <h3 className="text-lg font-bold text-zinc-900 mb-1">Email {selectedEmailableCount} lead{selectedEmailableCount === 1 ? "" : "s"}</h3>
                  <p className="text-xs text-zinc-500 mb-4">The Revalor Media Guide PDF is attached automatically to every send.</p>
                  {emailSendError && <div className="mb-3 p-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">{emailSendError}</div>}

                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => setEmailMode("generic")}
                      className={`flex-1 text-xs font-semibold px-3 py-2 rounded-xl border transition-colors ${
                        emailMode === "generic" ? "bg-[#1A3A5C] text-white border-[#1A3A5C]" : "border-[#B8860B] text-zinc-600 hover:bg-slate-100"
                      }`}
                    >
                      Generic Text
                    </button>
                    <button
                      onClick={() => setEmailMode("custom")}
                      className={`flex-1 text-xs font-semibold px-3 py-2 rounded-xl border transition-colors ${
                        emailMode === "custom" ? "bg-[#1A3A5C] text-white border-[#1A3A5C]" : "border-[#B8860B] text-zinc-600 hover:bg-slate-100"
                      }`}
                    >
                      Freeform
                    </button>
                  </div>

                  {emailMode === "generic" ? (
                    <div className="mb-4 p-3 rounded-xl bg-slate-50 border border-[#B8860B] text-xs text-zinc-600 space-y-2">
                      <p className="font-semibold text-zinc-500">Subject: A quick idea for [Business Name]</p>
                      <p>Hi [Business Name] team,</p>
                      <p>I&apos;m reaching out from Revalor LLC — we build software that helps businesses like yours save time and grow. I&apos;ve attached a quick guide to what we offer.</p>
                      <p>Happy to answer any questions.</p>
                      <p>Best,<br />Revalor Team</p>
                    </div>
                  ) : (
                    <div className="mb-4 space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-zinc-500 mb-1">Subject</label>
                        <input
                          type="text"
                          value={emailSubject}
                          onChange={(e) => setEmailSubject(e.target.value)}
                          placeholder="e.g. A quick idea for {{business_name}}"
                          className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-500 mb-1">Body</label>
                        <textarea
                          value={emailBody}
                          onChange={(e) => setEmailBody(e.target.value)}
                          rows={6}
                          placeholder="Hi {{business_name}} team, ..."
                          className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm"
                        />
                        <p className="text-[11px] text-zinc-500 mt-1">Use <code>{"{{business_name}}"}</code> to personalize each email.</p>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setEmailModalOpen(false)}
                      disabled={sendingEmails}
                      className="text-sm font-semibold px-4 py-2 rounded-xl border border-[#B8860B] text-zinc-700 hover:bg-slate-100 disabled:opacity-50"
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

        {/* ── Partners ── */}
        {tab === "partners" && (
          <div className="space-y-6">
            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Applications (filtered)" value={filteredPartners.length} />
              <StatCard
                label="Pending Review"
                value={partners.filter((p) => p.status === "pending").length}
                accent="blue"
              />
              <StatCard
                label="Approved"
                value={partners.filter((p) => p.status === "approved").length}
                accent="green"
              />
              <StatCard
                label="Tier 1 Partners"
                value={partners.filter((p) => p.tier === "tier_1" && p.status === "approved").length}
                accent="red"
              />
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <select
                value={partnerStatusFilter}
                onChange={(e) => setPartnerStatusFilter(e.target.value as PartnerStatus | "all")}
                className="border border-[#B8860B] rounded-xl px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20"
              >
                <option value="all">All statuses</option>
                {(["pending", "approved", "denied"] as PartnerStatus[]).map((s) => (
                  <option key={s} value={s}>{PARTNER_STATUS_STYLE[s].label}</option>
                ))}
              </select>
              <select
                value={partnerTierFilter}
                onChange={(e) => setPartnerTierFilter(e.target.value as PartnerTier | "all")}
                className="border border-[#B8860B] rounded-xl px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20"
              >
                <option value="all">All tiers</option>
                {(["tier_1", "tier_2", "tier_3"] as PartnerTier[]).map((t) => (
                  <option key={t} value={t}>{PARTNER_TIER_STYLE[t].label}</option>
                ))}
              </select>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-[#B8860B] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-zinc-100">
                    <tr>
                      <Th>Business</Th>
                      <Th>Industry</Th>
                      <Th>Score</Th>
                      <Th>Tier</Th>
                      <Th>Discount</Th>
                      <Th>Budget / Reach / Referrals</Th>
                      <Th>Uploads</Th>
                      <Th>Status</Th>
                      <Th>Agreement</Th>
                      <Th>Decision</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {paginatedPartners.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="text-center py-12 text-zinc-500">
                          No partner applications yet.
                        </td>
                      </tr>
                    ) : (
                      paginatedPartners.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50 align-top">
                          <td className="px-4 py-3">
                            <div className="font-medium text-zinc-900">{p.business_name}</div>
                            <div className="text-xs text-zinc-500">{p.owner_name}</div>
                            <a href={`mailto:${p.email}`} className="text-xs text-green-600 hover:underline block">
                              {p.email}
                            </a>
                            <div className="text-xs text-zinc-500">{p.phone}</div>
                            {p.online_presence_url && (
                              <a
                                href={p.online_presence_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-green-600 hover:underline block max-w-[160px] truncate"
                                title={p.online_presence_url}
                              >
                                {p.online_presence_url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                              </a>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-zinc-600">
                            {p.industry.replace(/_/g, " ")}
                            <div className="text-zinc-500 mt-1 max-w-[180px]">
                              {p.services_offered.join(", ")}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="text-xs font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700"
                              title={p.score_breakdown.map((s) => `${s.label}: ${s.points}`).join("\n")}
                            >
                              {p.total_score}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {p.tier && (
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${PARTNER_TIER_STYLE[p.tier].cls}`}>
                                {PARTNER_TIER_STYLE[p.tier].label}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-zinc-600">
                            {p.discount_percentage != null ? `${p.discount_percentage}%` : "—"}
                          </td>
                          <td className="px-4 py-3 text-xs text-zinc-600 whitespace-nowrap">
                            <div>{p.budget_range.replace(/_/g, " – $")}</div>
                            <div>{p.social_reach_range.replace(/_/g, " – ")} reach</div>
                            <div>{p.referral_network_size.replace(/_/g, " – ")} referrals</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1 max-w-[140px]">
                              {p.logo_path && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={partnerUploadUrl(p.logo_path)}
                                  alt={`${p.business_name} logo`}
                                  className="w-10 h-10 rounded-lg object-contain border border-[#B8860B] bg-white"
                                />
                              )}
                              {p.photo_paths.map((path) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  key={path}
                                  src={partnerUploadUrl(path)}
                                  alt={`${p.business_name} photo`}
                                  className="w-10 h-10 rounded-lg object-cover border border-[#B8860B]"
                                />
                              ))}
                              {!p.logo_path && p.photo_paths.length === 0 && (
                                <span className="text-xs text-zinc-600">—</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${PARTNER_STATUS_STYLE[p.status].cls}`}>
                              {PARTNER_STATUS_STYLE[p.status].label}
                            </span>
                            {p.reviewed_by && (
                              <div className="text-[10px] text-zinc-500 mt-1">
                                by {p.reviewed_by}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs whitespace-nowrap">
                            {p.status !== "approved" ? (
                              <span className="text-zinc-600">—</span>
                            ) : p.agreement_accepted_at ? (
                              <span className="font-semibold text-green-600">
                                Accepted {new Date(p.agreement_accepted_at).toLocaleDateString()}
                              </span>
                            ) : p.agreement_terms ? (
                              <span className="font-semibold text-amber-600">Awaiting acceptance</span>
                            ) : (
                              <span className="text-zinc-500">Not generated</span>
                            )}
                          </td>
                          <td className="px-4 py-3 min-w-[180px]">
                            {p.status === "pending" ? (
                              <div className="space-y-2">
                                <textarea
                                  value={partnerDecisionNotes[p.id] ?? ""}
                                  onChange={(e) =>
                                    setPartnerDecisionNotes((prev) => ({ ...prev, [p.id]: e.target.value }))
                                  }
                                  placeholder="Notes (optional)"
                                  rows={2}
                                  className="w-full text-xs border border-[#B8860B] rounded-lg px-2 py-1.5 resize-none"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handlePartnerDecision(p.id, "approved")}
                                    disabled={updatingPartnerId === p.id}
                                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handlePartnerDecision(p.id, "denied")}
                                    disabled={updatingPartnerId === p.id}
                                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                                  >
                                    Deny
                                  </button>
                                </div>
                              </div>
                            ) : (
                              p.admin_notes && (
                                <p className="text-xs text-zinc-500 max-w-[180px]">{p.admin_notes}</p>
                              )
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={partnersPage}
                totalPages={partnersTotalPages}
                onPrev={() => setPartnersPage((p) => Math.max(1, p - 1))}
                onNext={() => setPartnersPage((p) => Math.min(partnersTotalPages, p + 1))}
              />
            </div>
          </div>
        )}

        {/* ── Referrals ── */}
        {tab === "referrals" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Referrals (filtered)" value={filteredReferrals.length} />
              <StatCard
                label="Submitted"
                value={referrals.filter((r) => r.status === "submitted").length}
              />
              <StatCard
                label="Contacted"
                value={referrals.filter((r) => r.status === "contacted").length}
                accent="blue"
              />
              <StatCard
                label="Converted"
                value={referrals.filter((r) => r.status === "converted").length}
                accent="green"
              />
            </div>

            <select
              value={referralStatusFilter}
              onChange={(e) => setReferralStatusFilter(e.target.value as PartnerReferralStatus | "all")}
              className="border border-[#B8860B] rounded-xl px-4 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20"
            >
              <option value="all">All statuses</option>
              {(["submitted", "contacted", "converted", "declined"] as PartnerReferralStatus[]).map((s) => (
                <option key={s} value={s}>{PARTNER_REFERRAL_STATUS_STYLE[s].label}</option>
              ))}
            </select>

            <div className="bg-white rounded-2xl border border-[#B8860B] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-zinc-100">
                    <tr>
                      <Th>Referred Business</Th>
                      <Th>Referred By</Th>
                      <Th>Contact</Th>
                      <Th>Status</Th>
                      <Th>Submitted</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {paginatedReferrals.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-12 text-zinc-500">
                          No referrals yet.
                        </td>
                      </tr>
                    ) : (
                      paginatedReferrals.map((r) => {
                        const referrer = partnersById.get(r.partner_application_id);
                        return (
                          <tr key={r.id} className="hover:bg-slate-50 align-top">
                            <td className="px-4 py-3">
                              <div className="font-medium text-zinc-900">{r.referred_business_name}</div>
                              {r.notes && <div className="text-xs text-zinc-500 max-w-[200px]">{r.notes}</div>}
                            </td>
                            <td className="px-4 py-3 text-xs text-zinc-600">
                              {referrer ? (
                                <>
                                  <div className="font-medium text-zinc-900">{referrer.business_name}</div>
                                  {referrer.tier && (
                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${PARTNER_TIER_STYLE[referrer.tier].cls}`}>
                                      {PARTNER_TIER_STYLE[referrer.tier].label}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="text-zinc-600">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-zinc-600">
                              {r.referred_contact_name && <div>{r.referred_contact_name}</div>}
                              {r.referred_email && <div className="text-zinc-500">{r.referred_email}</div>}
                              {r.referred_phone && <div className="text-zinc-500">{r.referred_phone}</div>}
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={r.status}
                                disabled={updatingReferralId === r.id}
                                onChange={(e) => handleReferralStatusChange(r.id, e.target.value as PartnerReferralStatus)}
                                className="text-xs border border-[#B8860B] rounded-lg px-2 py-1 bg-white disabled:opacity-50"
                              >
                                {(["submitted", "contacted", "converted", "declined"] as PartnerReferralStatus[]).map((s) => (
                                  <option key={s} value={s}>{PARTNER_REFERRAL_STATUS_STYLE[s].label}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-3 text-xs text-zinc-600 whitespace-nowrap">
                              {new Date(r.created_at).toLocaleDateString()}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={referralsPage}
                totalPages={referralsTotalPages}
                onPrev={() => setReferralsPage((p) => Math.max(1, p - 1))}
                onNext={() => setReferralsPage((p) => Math.min(referralsTotalPages, p + 1))}
              />
            </div>
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
    <div className="bg-white rounded-2xl border border-[#B8860B] p-5">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${
        accent === "green" ? "text-green-600" :
        accent === "blue" ? "text-blue-600" :
        accent === "red" ? "text-red-600" :
        "text-zinc-900"
      }`}>
        {value}
      </p>
      {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
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
    amber: "text-amber-700 bg-amber-100",
    blue: "text-blue-700 bg-blue-100",
    green: "text-green-700 bg-green-100",
    red: "text-red-700 bg-red-100",
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
    <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">
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
    <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-100">
      <button
        onClick={onPrev}
        disabled={page <= 1}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#B8860B] text-zinc-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        ← Prev
      </button>
      <span className="text-xs text-zinc-500">
        Page {page} of {totalPages}
      </span>
      <button
        onClick={onNext}
        disabled={page >= totalPages}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#B8860B] text-zinc-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
  noticeMessages,
  onPostNotice,
  deletingApps,
  appDeleteErrors,
  onDeleteApp,
  paymentsTestMode,
  togglingTest,
  onTogglePaymentsTest,
  aiCostByApp,
}: {
  apps: AdminDashboardProps["apps"];
  userEmails: Record<string, string>;
  redeploying: Record<string, boolean>;
  redeployMessages: Record<string, string>;
  onRedeploy: (id: string) => void;
  noticeMessages: Record<string, string>;
  onPostNotice: (id: string, current: string | null) => void;
  deletingApps: Record<string, boolean>;
  appDeleteErrors: Record<string, string>;
  onDeleteApp: (id: string, name: string) => void;
  paymentsTestMode: Record<string, boolean>;
  togglingTest: Record<string, boolean>;
  onTogglePaymentsTest: (id: string) => void;
  aiCostByApp: Map<string, number>;
}) {
  const canRedeploy = (status: AppStatus) =>
    status === "failed" || status === "deploy_failed" || status === "ready";
  const infra = estimatedBuildInfraUsd();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-zinc-100">
          <tr>
            <Th>App</Th>
            <Th>User</Th>
            <Th>Status</Th>
            <Th>Build cost</Th>
            <Th>Created</Th>
            <Th>URL</Th>
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {apps.length === 0 ? (
            <tr>
              <td colSpan={7} className="text-center py-12 text-zinc-500">
                No apps found
              </td>
            </tr>
          ) : (
            apps.map((app) => {
              const statusCfg = STATUS_STYLE[app.status] ?? { label: app.status, cls: "bg-zinc-100 text-zinc-600" };
              const email = (app.user_id && userEmails[app.user_id]) || (app.user_id ? app.user_id.slice(0, 8) + "…" : "preview");
              const msg = redeployMessages[app.id];
              return (
                <tr key={app.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{CATEGORY_ICONS[app.category]}</span>
                      <div>
                        <div className="font-medium text-zinc-900">{app.name}</div>
                        <div className="text-xs text-zinc-500 capitalize">{app.category}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-600 text-xs">{email}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusCfg.cls}`}>
                      {statusCfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">
                    {aiCostByApp.has(app.id) ? (
                      <span title={`AI $${(aiCostByApp.get(app.id) ?? 0).toFixed(2)} + ~$${infra.toFixed(2)} infra est.`}>
                        <span className="font-medium text-zinc-800">
                          ${((aiCostByApp.get(app.id) ?? 0) + infra).toFixed(2)}
                        </span>
                        <span className="text-zinc-400"> (AI ${(aiCostByApp.get(app.id) ?? 0).toFixed(2)})</span>
                      </span>
                    ) : (
                      <span className="text-zinc-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs whitespace-nowrap">
                    {new Date(app.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {app.deploy_url ? (
                      <a
                        href={app.deploy_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 hover:underline truncate block max-w-[160px]"
                      >
                        {app.deploy_url.replace("https://", "")}
                      </a>
                    ) : (
                      <span className="text-xs text-zinc-600">—</span>
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
                      {app.user_id && (
                        <button
                          onClick={() => onTogglePaymentsTest(app.id)}
                          disabled={togglingTest[app.id]}
                          title="Stripe Connect test mode — payments run against Stripe test data (card 4242…). Toggling resets this app's Connect onboarding."
                          className={`text-xs px-3 py-1 rounded-lg border transition-colors whitespace-nowrap disabled:opacity-50 ${
                            paymentsTestMode[app.id]
                              ? "border-amber-400 bg-amber-50 text-amber-700"
                              : "border-zinc-300 text-zinc-500 hover:bg-slate-100"
                          }`}
                        >
                          {togglingTest[app.id]
                            ? "…"
                            : paymentsTestMode[app.id]
                              ? "Test pay: ON"
                              : "Test pay: off"}
                        </button>
                      )}
                      {(app.status === "failed" || app.status === "deploy_failed") && (
                        <button
                          onClick={() => onPostNotice(app.id, app.build_notice)}
                          title={
                            app.build_notice
                              ? `Customer sees: "${app.build_notice}"`
                              : "Post a status update the customer sees on /generate and their dashboard"
                          }
                          className="text-xs px-3 py-1 rounded-lg border border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors whitespace-nowrap"
                        >
                          {app.build_notice ? "Edit update" : "Post update"}
                        </button>
                      )}
                      {noticeMessages[app.id] && (
                        <span
                          className={`text-xs ${noticeMessages[app.id].includes("✓") ? "text-green-600" : "text-red-600"}`}
                        >
                          {noticeMessages[app.id]}
                        </span>
                      )}
                      {msg && (
                        <span className={`text-xs ${msg.includes("✓") ? "text-green-600" : "text-red-600"}`}>
                          {msg}
                        </span>
                      )}
                      <button
                        onClick={() => onDeleteApp(app.id, app.name)}
                        disabled={deletingApps[app.id]}
                        title="Permanently delete this app — Vercel project, tenant database, and all records."
                        className="text-xs px-3 py-1 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors whitespace-nowrap"
                      >
                        {deletingApps[app.id] ? "Deleting…" : "Delete"}
                      </button>
                      {appDeleteErrors[app.id] && (
                        <span className="text-xs text-red-600">{appDeleteErrors[app.id]}</span>
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
