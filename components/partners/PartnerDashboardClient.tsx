"use client";

import { useState } from "react";
import type { AgreementTerms } from "@/lib/database.types";
import AgreementView from "@/components/partners/AgreementView";
import ReferralsPanel from "@/components/partners/ReferralsPanel";
import RequirementsPanel from "@/components/partners/RequirementsPanel";

type Tab = "agreement" | "referrals" | "requirements";

interface ReferralRow {
  id: string;
  referred_business_name: string;
  status: string;
  created_at: string;
}

export default function PartnerDashboardClient({
  businessName,
  agreementTerms,
  agreementAcceptedAt,
  referralCode,
  completedPromotionalActions,
  convertedReferralCount,
  referralBonusDiscountPercentage,
  initialReferrals,
}: {
  businessName: string;
  agreementTerms: AgreementTerms;
  agreementAcceptedAt: string;
  referralCode: string | null;
  completedPromotionalActions: string[];
  convertedReferralCount: number;
  referralBonusDiscountPercentage: number;
  initialReferrals: ReferralRow[];
}) {
  const [tab, setTab] = useState<Tab>("agreement");

  const TABS: { id: Tab; label: string }[] = [
    { id: "agreement", label: "Agreement" },
    { id: "referrals", label: "Referrals" },
    { id: "requirements", label: "Requirements" },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-navy-dark mb-1">Partner Dashboard</h1>
        <p className="text-gray-500 text-sm">{businessName}</p>
      </div>

      <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit mx-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? "bg-navy-dark text-white" : "text-gray-500 hover:text-gray-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "agreement" && (
        <div className="space-y-4">
          <AgreementView terms={agreementTerms} />
          <p className="text-center text-sm text-green-600 font-medium">
            Accepted on {new Date(agreementAcceptedAt).toLocaleDateString()}
          </p>
        </div>
      )}

      {tab === "referrals" && (
        <ReferralsPanel
          referralCode={referralCode}
          convertedReferralCount={convertedReferralCount}
          referralBonusDiscountPercentage={referralBonusDiscountPercentage}
          initialReferrals={initialReferrals}
        />
      )}

      {tab === "requirements" && (
        <RequirementsPanel
          requiredActions={agreementTerms.requiredPromotionalActions}
          completedActions={completedPromotionalActions}
        />
      )}
    </div>
  );
}
