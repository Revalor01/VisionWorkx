import Navbar from "@/components/nav/Navbar";
import Footer from "@/components/nav/Footer";

export const metadata = {
  title: "Terms of Service — Vision Workx",
  description: "The terms governing use of Vision Workx.",
};

const LAST_UPDATED = "August 1, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-navy-dark mb-3">{title}</h2>
      <div className="space-y-3 text-sm text-gray-600 leading-relaxed">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-off-white flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-12">
        <h1 className="text-3xl font-bold text-navy-dark mb-2">Terms of Service</h1>
        <p className="text-xs text-gray-400 mb-10">Last updated: {LAST_UPDATED}</p>

        <Section title="1. Agreement to Terms">
          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) are a legal agreement between you (&ldquo;you,&rdquo;
            &ldquo;your,&rdquo; or &ldquo;Customer&rdquo;) and Revalor LLC, doing business as Vision Workx
            (&ldquo;Vision Workx,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;). By creating
            an account, starting a trial, or otherwise using our website generation and hosting platform (the
            &ldquo;Service&rdquo;), you agree to be bound by these Terms. If you don&apos;t agree, don&apos;t
            use the Service.
          </p>
        </Section>

        <Section title="2. The Service">
          <p>
            Vision Workx lets you describe your business and generates a working web application for it using
            AI, which we then host on your behalf. The Service includes the app-generation tool, the hosted
            application itself, the settings/dashboard used to manage it, and any related products we offer
            (including Vision Workx Promote and the Partner Program).
          </p>
          <p>
            AI-generated output can be wrong, incomplete, or not exactly what you asked for. You&apos;re
            responsible for reviewing your generated app before relying on it for real business use — including
            checking that pricing, contact information, and business details are accurate.
          </p>
        </Section>

        <Section title="3. Accounts">
          <p>
            You must provide accurate information when creating an account and keep your login credentials
            confidential. You&apos;re responsible for all activity that happens under your account. Let us know
            right away at{" "}
            <a href="mailto:info@revalorllc.com" className="text-navy underline">
              info@revalorllc.com
            </a>{" "}
            if you suspect unauthorized access.
          </p>
        </Section>

        <Section title="4. Plans, Trials, and Billing">
          <p>
            New accounts get a 14-day free trial. After the trial ends, continued access to app creation and
            generation requires an active paid subscription (Starter, Growth, or Pro). Subscriptions are billed
            in advance on a recurring basis (monthly or annual, depending on the plan you choose) through our
            payment processor, Stripe, and renew automatically until cancelled.
          </p>
          <p>
            You can cancel anytime from your billing dashboard. Cancelling stops future renewals; it does not
            retroactively refund amounts already charged, except where required by law or where we state
            otherwise in writing. Prices and plan features are shown on our{" "}
            <a href="/#pricing" className="text-navy underline">
              pricing page
            </a>{" "}
            and are subject to change with reasonable notice for existing subscribers.
          </p>
        </Section>

        <Section title="5. Acceptable Use">
          <p>You agree not to use the Service to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Generate or host content that is illegal, fraudulent, or infringes someone else&apos;s rights;</li>
            <li>Impersonate a person or business you&apos;re not authorized to represent;</li>
            <li>Attempt to gain unauthorized access to other customers&apos; accounts, apps, or data;</li>
            <li>Interfere with or disrupt the Service&apos;s infrastructure, including excessive automated requests;</li>
            <li>Resell or sublicense the Service itself (as opposed to the apps you generate with it) without our written consent.</li>
          </ul>
          <p>
            We may suspend or terminate accounts that violate this section, with or without notice depending on
            severity.
          </p>
        </Section>

        <Section title="6. Your Content and Generated Apps">
          <p>
            You retain ownership of the business information, images, and other content you provide us
            (&ldquo;Your Content&rdquo;). You grant us a license to use Your Content solely to generate, host, and operate
            your app.
          </p>
          <p>
            As between you and us, you own the generated application built for your business, for as long as
            your subscription covering it remains active. If your subscription lapses or you delete an app, we
            may take the hosted app offline and, after a reasonable period, delete the underlying code and data.
            Export or migration of a generated app off Vision Workx hosting is not currently supported.
          </p>
        </Section>

        <Section title="7. Third-Party Services">
          <p>
            The Service relies on third-party infrastructure to operate, including hosting (Vercel), database
            and authentication (Supabase), payments (Stripe), transactional email (Resend), and AI generation
            (Anthropic). Your use of the Service is also subject to the extent those providers&apos; own terms
            apply to processing carried out on our behalf.
          </p>
        </Section>

        <Section title="8. Intellectual Property">
          <p>
            Vision Workx and its licensors own all rights in the Service itself — the generation engine,
            platform code, branding, and underlying technology — excluding Your Content and the specific
            generated app built for your business. Nothing in these Terms transfers any of our intellectual
            property to you beyond the generated app described in Section 6.
          </p>
        </Section>

        <Section title="9. Disclaimers">
          <p>
            THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE,&rdquo; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS,
            IMPLIED, OR STATUTORY, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR
            NON-INFRINGEMENT. WE DON&apos;T WARRANT THAT AI-GENERATED OUTPUT WILL BE ACCURATE, ERROR-FREE, OR
            SUITABLE FOR YOUR SPECIFIC BUSINESS NEEDS, OR THAT THE SERVICE WILL BE UNINTERRUPTED OR SECURE.
          </p>
        </Section>

        <Section title="10. Limitation of Liability">
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, VISION WORKX AND ITS OFFICERS, EMPLOYEES, AND AFFILIATES
            WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY
            LOSS OF PROFITS, REVENUE, DATA, OR BUSINESS OPPORTUNITY, ARISING FROM YOUR USE OF THE SERVICE. OUR
            TOTAL LIABILITY FOR ANY CLAIM RELATING TO THE SERVICE WILL NOT EXCEED THE AMOUNT YOU PAID US IN THE
            12 MONTHS BEFORE THE CLAIM AROSE.
          </p>
        </Section>

        <Section title="11. Termination">
          <p>
            You may stop using the Service and cancel your subscription at any time. We may suspend or
            terminate your access if you materially breach these Terms, fail to pay amounts owed, or if we
            discontinue the Service or a plan you&apos;re on, with reasonable notice where practical.
          </p>
        </Section>

        <Section title="12. Changes to These Terms">
          <p>
            We may update these Terms from time to time. If we make material changes, we&apos;ll update the
            &ldquo;Last updated&rdquo; date above and, where required, notify you by email. Continuing to use the Service
            after changes take effect means you accept the updated Terms.
          </p>
        </Section>

        <Section title="13. Governing Law">
          <p>
            These Terms are governed by the laws of [STATE/JURISDICTION — TO BE CONFIRMED], without regard to
            its conflict-of-law principles, unless a different governing law is required by the law of your
            jurisdiction as a consumer.
          </p>
        </Section>

        <Section title="14. Contact">
          <p>
            Questions about these Terms? Reach us at{" "}
            <a href="mailto:info@revalorllc.com" className="text-navy underline">
              info@revalorllc.com
            </a>
            .
          </p>
        </Section>
      </main>
      <Footer />
    </div>
  );
}
