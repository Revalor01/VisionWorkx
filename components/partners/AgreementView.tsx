import type { AgreementTerms } from "@/lib/database.types";

export default function AgreementView({ terms }: { terms: AgreementTerms }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 space-y-6">
      <div>
        <span className="inline-block text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 mb-2">
          {terms.tierLabel}
        </span>
        <h2 className="text-xl font-bold text-navy-dark">{terms.discountPercentage}% Partner Discount</h2>
      </div>

      <Section title="Required Promotional Actions">
        <ul className="list-disc list-inside space-y-1.5 text-sm text-gray-700">
          {terms.requiredPromotionalActions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ul>
      </Section>

      <Section title="Referral Expectations">
        <p className="text-sm text-gray-700">{terms.referralExpectations}</p>
      </Section>

      <Section title="Scope">
        <p className="text-sm text-gray-700">{terms.scopeNote}</p>
      </Section>

      <Section title="Timeline">
        <p className="text-sm text-gray-700">{terms.timeline}</p>
      </Section>

      <Section title="Payment Structure">
        <p className="text-sm text-gray-700">{terms.paymentStructure}</p>
      </Section>

      <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">
        Agreement generated {new Date(terms.generatedAt).toLocaleDateString()}.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</h3>
      {children}
    </div>
  );
}
