"use client";

import { useState, useMemo, useEffect } from "react";
import { useOnChange } from "@/lib/hooks";
import { useRouter } from "next/navigation";
import { AdminHeader, AdminProductPills } from "./AdminNavHeader";
import type { Lead, LeadLanguage, LeadStatus, PartnerApplication, PartnerReferral, PartnerReferralStatus, PartnerStatus, PartnerTier } from "@/lib/database.types";
import { scoreBucket } from "@/lib/leadScoring";

// VisionWorkx admin home: Leads, Partners and Referrals. (The old app-builder
// dashboard — overview, stability, apps, users, payments, automations — was
// removed after the pivot to VisionWorkx Modules; Modules has its own admin at
// /admin/modules.) The three tabs are unchanged from that dashboard.

interface LeadsPartnersDashboardProps {
  initialLeads: Lead[];
  initialPartners: PartnerApplication[];
  initialReferrals: PartnerReferral[];
}

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


type Tab = "leads" | "partners" | "referrals";

export default function LeadsPartnersDashboard({ initialLeads, initialPartners, initialReferrals }: LeadsPartnersDashboardProps) {
  const router = useRouter();
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [tab, setTab] = useState<Tab>("leads");

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

  // Auto-refresh re-renders with fresh server props; take them over.
  useOnChange(initialLeads, setLeads);
  useOnChange(
    JSON.stringify([leadStatusFilter, leadCategoryFilter, leadLanguageFilter, leadWebsiteFilter, leadEmailFilter, leadMinScore]),
    () => setLeadsPage(1)
  );

  // ── Partners state ─────────────────────────────────────────────
  const [partners, setPartners] = useState<PartnerApplication[]>(initialPartners);
  const [partnerStatusFilter, setPartnerStatusFilter] = useState<PartnerStatus | "all">("all");
  const [partnerTierFilter, setPartnerTierFilter] = useState<PartnerTier | "all">("all");
  const [updatingPartnerId, setUpdatingPartnerId] = useState<string | null>(null);
  const [partnerDecisionNotes, setPartnerDecisionNotes] = useState<Record<string, string>>({});
  const [partnersPage, setPartnersPage] = useState(1);
  const PARTNERS_PER_PAGE = 30;

  useOnChange(initialPartners, setPartners);
  useOnChange(JSON.stringify([partnerStatusFilter, partnerTierFilter]), () => setPartnersPage(1));

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

  useOnChange(initialReferrals, setReferrals);
  useOnChange(referralStatusFilter, () => setReferralsPage(1));

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

  function toggleSelectAllFiltered() {
    setSelectedLeadIds((prev) => {
      const allSelected = filteredLeads.length > 0 && filteredLeads.every((l) => prev.has(l.id));
      if (allSelected) return new Set();
      return new Set(filteredLeads.map((l) => l.id));
    });
  }

  const leadsTotalPages = Math.max(1, Math.ceil(filteredLeads.length / LEADS_PER_PAGE));
  const paginatedLeads = useMemo(
    () => filteredLeads.slice((leadsPage - 1) * LEADS_PER_PAGE, leadsPage * LEADS_PER_PAGE),
    [filteredLeads, leadsPage, LEADS_PER_PAGE]
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

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <AdminHeader
        badge="Admin"
        extra={
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
              autoRefresh ? "bg-green-500/20 text-green-300" : "bg-black/10 text-white/70 hover:text-white"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? "bg-green-400 animate-pulse" : "bg-black/40"}`} />
            Auto-refresh {autoRefresh ? "on" : "off"}
          </button>
        }
      />

      <div className="max-w-admin mx-auto px-4 sm:px-6 lg:px-10 py-8">
        <AdminProductPills />

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-900">VisionWorkx Admin: Leads &amp; Partners</h1>
          <p className="text-zinc-500 text-sm mt-1">Prospect leads, partner applications and partner referrals. Modules customers are under Modules.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white border border-[#B8860B] rounded-xl p-1 w-full sm:w-fit overflow-x-auto">
          {(["leads", "partners", "referrals"] as Tab[]).map((t) => (
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

        {/* ── Leads ── */}
        {tab === "leads" && (
          <div className="space-y-6">
            {/* Search */}
            <CollapsibleSection
              title="Find Leads"
              subtitle="Searches OpenStreetMap around a location and scores every business found."
            >
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
            </CollapsibleSection>

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

function CollapsibleSection({
  title,
  subtitle,
  actions,
  defaultOpen = false,
  padded = true,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  defaultOpen?: boolean;
  padded?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-2xl border border-[#B8860B] overflow-hidden">
      <div
        className="flex items-center justify-between gap-3 px-6 py-4 cursor-pointer select-none"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="min-w-0">
          <h2 className="font-semibold text-zinc-900">{title}</h2>
          {subtitle && <div className="text-xs text-zinc-500 mt-0.5">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {actions && <div onClick={(e) => e.stopPropagation()}>{actions}</div>}
          <svg
            className={`w-4 h-4 text-zinc-400 transition-transform ${open ? "" : "-rotate-90"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
      {open && (
        <div className={`border-t border-zinc-100 ${padded ? "px-6 py-6" : ""}`}>
          {children}
        </div>
      )}
    </div>
  );
}

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
