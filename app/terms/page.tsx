import Navbar from "@/components/nav/Navbar";
import Footer from "@/components/nav/Footer";

export const metadata = {
  title: "Terms of Service — VisionWorkx",
  description: "The terms governing use of VisionWorkx, including the App Builder and VisionWorkx Modules.",
};

// Keep in step with TERMS_VERSION in lib/modules/selfServe.ts (recorded at signup).
const LAST_UPDATED = "September 26, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-navy-dark mb-3">{title}</h2>
      <div className="space-y-3 text-sm text-gray-600 leading-relaxed">{children}</div>
    </section>
  );
}

function Email() {
  return (
    <a href="mailto:info@revalorllc.com" className="text-navy underline">
      info@revalorllc.com
    </a>
  );
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-off-white flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-12">
        <h1 className="text-3xl font-bold text-navy-dark mb-2">Terms of Service</h1>
        <p className="text-xs text-gray-400 mb-10">Last updated: {LAST_UPDATED}</p>

        <Section title="Agreement to these Terms">
          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) are a legal agreement between you (&ldquo;you,&rdquo; &ldquo;your,&rdquo; or
            &ldquo;Customer&rdquo;) and Revalor LLC, doing business as VisionWorkx (&ldquo;VisionWorkx,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo;
            or &ldquo;our&rdquo;). By creating an account, starting a trial, or otherwise using any part of the Service described below,
            you agree to these Terms. If you are accepting on behalf of a business, you confirm you are authorized to bind it. If you
            don&apos;t agree, don&apos;t use the Service.
          </p>
        </Section>

        <Section title="1. The Service">
          <p>VisionWorkx offers two products, together the &ldquo;Service&rdquo;:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>VisionWorkx App Builder</strong>: describe your business and we generate and host a working web application for it
              using AI.
            </li>
            <li>
              <strong>VisionWorkx Modules</strong>: ready-made website features (for example lead capture, quote requests, booking and
              intake forms) that you add to a website you already have by pasting a snippet of code. Modules include the embeddable forms,
              a dashboard for the submissions they collect (&ldquo;Workspace&rdquo;), automatic emails to the people who submit them,
              optional webhooks, and an AI assistant that drafts forms from a plain-English description.
            </li>
          </ul>
          <p>Sections that apply to only one product say so.</p>
        </Section>

        <Section title="2. AI-generated output">
          <p>
            AI-generated apps, forms, labels and email text can be wrong, incomplete, or not what you asked for. You are responsible for
            reviewing anything generated before you publish or rely on it, including prices, contact details and any wording shown to your
            own customers.
          </p>
        </Section>

        <Section title="3. Accounts">
          <p>
            You must give accurate information and keep access to your account secure. Workspaces use passwordless sign-in: we email a
            single-use link to your address, so anyone with access to that inbox can sign in. You&apos;re responsible for all activity under
            your account, including by staff you invite. Tell us right away at <Email /> if you suspect unauthorized access.
          </p>
          <p>Each person may create one self-serve Modules workspace. Additional workspaces are available by arrangement with us.</p>
        </Section>

        <Section title="4. Free trial, subscriptions and billing">
          <p>
            <strong>Trial.</strong> New subscriptions include a 14-day free trial.{" "}
            <strong>
              A payment card is required to start the trial. Unless you cancel before the trial ends, your subscription starts
              automatically and your card is charged the plan price shown at checkout, then on each renewal.
            </strong>{" "}
            We email you a reminder before your trial ends. You can cancel during the trial from the Billing page in your Workspace, or from
            the link in the reminder email, and you won&apos;t be charged. One free trial per business.
          </p>
          <p>
            <strong>Plans.</strong> Paid plans (Starter, Growth, Pro) are billed in advance, monthly or annually, through Stripe, and renew
            automatically until cancelled. Current prices and what each plan includes are shown on our pricing page and in your Workspace.
          </p>
          <p>
            <strong>Cancellation.</strong> You can cancel anytime from the Billing page (which opens our payment processor&apos;s billing
            portal). Cancellation takes effect at the end of the current billing period. We don&apos;t refund amounts already charged, except
            where required by law or where we agree otherwise in writing.
          </p>
          <p>
            <strong>Changes.</strong> We may change prices or plan features with at least 30 days&apos; notice to existing subscribers;
            changes apply from your next renewal after the notice period.
          </p>
          <p>
            <strong>Failed payments.</strong> If a payment fails, we&apos;ll notify you and retry. If it remains unpaid, we may suspend the
            Service until it is resolved.
          </p>
        </Section>

        <Section title="5. Modules plan limits (Modules only)">
          <p>
            Each plan includes limits on live modules, monthly form submissions, automatic emails, file storage and AI form drafts, as shown
            on the pricing page. When you approach a monthly submission limit we email you at 80% and 100%. So that you don&apos;t lose
            customers, we keep accepting submissions up to 150% of your monthly limit; beyond that, your forms show visitors a
            &ldquo;temporarily unavailable, please contact the business directly&rdquo; message until the next month or until you upgrade.
            Automatic emails beyond your monthly email limit are not sent, and uploads beyond your storage limit are refused. Limits reset on
            the first day of each calendar month (UTC).
          </p>
        </Section>

        <Section title="6. Your responsibilities for data you collect (Modules only)">
          <p>
            When your forms collect information from visitors to your website (&ldquo;End-Customer Data&rdquo;),{" "}
            <strong>you are responsible for that collection</strong> and we process the data on your behalf as your service provider (see
            our Privacy Policy and Section 7). You agree to:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>tell visitors how you use their information, in your own privacy notice on your website;</li>
            <li>
              have a lawful basis for collecting it and for any messages sent to them, including the automatic emails you turn on;
            </li>
            <li>
              <strong>not use modules to collect</strong> payment-card numbers, bank details, government ID numbers (such as Social Security
              numbers), passwords, health or medical information subject to HIPAA, or other sensitive categories of data; the Service is not
              designed or certified for them (for example, it is not PCI-DSS or HIPAA compliant);
            </li>
            <li>not use modules on websites directed at children under 13, or knowingly collect data from them;</li>
            <li>keep the website domains listed in your Workspace accurate; modules only run on those domains.</li>
          </ul>
        </Section>

        <Section title="7. Processing End-Customer Data (Modules only)">
          <p>
            We process End-Customer Data only to provide the Service to you: storing submissions, showing them in your Workspace, sending the
            automatic emails and notifications you configure, delivering webhooks to the address you choose, and keeping the Service secure.
            We don&apos;t sell it, use it to train AI models, or use it to market to your customers. You can export your submissions as CSV at
            any time. A Data Processing Addendum is available on request at <Email />.
          </p>
        </Section>

        <Section title="8. Installation service (Modules only)">
          <p>
            If you ask us to install a module for you (&ldquo;Have Revalor install it&rdquo;), you may need to give us temporary access to
            your website builder. We&apos;ll use that access only to add the module and will make no other changes without your permission.
            You remain responsible for your website and should remove our access once installation is done. We&apos;re not responsible for
            issues with your site that aren&apos;t caused by our installation work.
          </p>
        </Section>

        <Section title="9. Acceptable use">
          <p>You agree not to use the Service to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>create or host content that is illegal, fraudulent, deceptive, or infringes someone else&apos;s rights;</li>
            <li>impersonate a person or business you aren&apos;t authorized to represent;</li>
            <li>collect login credentials, run phishing, or collect data under false pretenses;</li>
            <li>send spam, or send automatic emails to people who didn&apos;t submit your form;</li>
            <li>attempt to access other customers&apos; accounts, workspaces or data;</li>
            <li>
              interfere with the Service&apos;s infrastructure, including excessive automated requests or attempts to bypass plan limits or
              rate limits;
            </li>
            <li>resell or sublicense the Service itself without our written consent.</li>
          </ul>
          <p>We may suspend or terminate accounts that violate this section, with or without notice depending on severity.</p>
        </Section>

        <Section title="10. Your content and generated output">
          <p>
            You keep ownership of the business information, images, form content, End-Customer Data and other material you provide
            (&ldquo;Your Content&rdquo;). You grant us a license to use Your Content only to provide and operate the Service for you.
          </p>
          <p>
            <em>App Builder:</em> As between you and us, you own the generated application built for your business while your subscription
            covering it remains active. If your subscription lapses or you delete an app, we may take it offline and, after a reasonable
            period, delete the underlying code and data. Export of a generated app off VisionWorkx hosting isn&apos;t currently supported.
          </p>
          <p>
            <em>Modules:</em> If your subscription ends, your modules stop accepting submissions. You can still sign in and export your data
            for 30 days after your subscription ends. After that, we delete your Workspace, its submissions and uploaded files.
          </p>
        </Section>

        <Section title="11. Third-party services">
          <p>
            The Service relies on third-party providers, including Vercel (hosting), Supabase (database, authentication and file storage),
            Stripe (payments), Resend (email delivery) and Anthropic (AI). Their terms may apply to processing they carry out for us.
          </p>
        </Section>

        <Section title="12. Our intellectual property">
          <p>
            VisionWorkx and its licensors own the Service itself, including the generation engine, module software, embed code, platform
            code and branding. We grant you a limited, non-exclusive, non-transferable right to use the Service, including embedding our
            module code on your listed domains, while your subscription is active.
          </p>
        </Section>

        <Section title="13. Availability">
          <p>
            We work to keep the Service available but don&apos;t guarantee uninterrupted operation, and there is no uptime commitment (SLA)
            unless agreed in writing. We may carry out maintenance; we design modules so that a maintenance window on our side does not take
            down your website.
          </p>
        </Section>

        <Section title="14. Disclaimer of warranties">
          <p>
            THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE,&rdquo; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS,
            IMPLIED, OR STATUTORY, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. WE
            DON&apos;T WARRANT THAT AI-GENERATED OUTPUT WILL BE ACCURATE OR SUITABLE FOR YOUR BUSINESS, THAT EVERY SUBMISSION OR EMAIL WILL BE
            DELIVERED, OR THAT THE SERVICE WILL BE UNINTERRUPTED OR SECURE.
          </p>
        </Section>

        <Section title="15. Limitation of liability">
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, VISIONWORKX AND ITS OFFICERS, EMPLOYEES AND AFFILIATES WILL NOT BE LIABLE FOR ANY
            INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, LEADS OR BUSINESS
            OPPORTUNITY, ARISING FROM YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM RELATING TO THE SERVICE WILL NOT EXCEED THE
            AMOUNT YOU PAID US IN THE 12 MONTHS BEFORE THE CLAIM AROSE.
          </p>
        </Section>

        <Section title="16. Indemnity">
          <p>
            You will defend and indemnify VisionWorkx against third-party claims arising from Your Content, End-Customer Data you collect,
            your website, or your breach of Sections 6 or 9.
          </p>
        </Section>

        <Section title="17. Termination">
          <p>
            You may stop using the Service and cancel at any time. We may suspend or terminate your access if you materially breach these
            Terms, fail to pay amounts owed, or if we discontinue the Service or a plan you&apos;re on, with reasonable notice where
            practical. Sections 6, 7 (for any retained data), 10, 12 and 14–16 survive termination.
          </p>
        </Section>

        <Section title="18. Changes to these Terms">
          <p>
            We may update these Terms. For material changes we&apos;ll update the date above and email account owners at least 14 days before
            they take effect. Continuing to use the Service after that means you accept the updated Terms. We record which version you
            accepted at signup.
          </p>
        </Section>

        <Section title="19. Governing law">
          <p>
            These Terms are governed by the laws of the State of Delaware, without regard to its conflict-of-law principles, except where
            the consumer-protection laws of your place of residence require otherwise.
          </p>
        </Section>

        <Section title="20. Contact">
          <p>
            Questions about these Terms? Reach us at <Email />.
          </p>
        </Section>
      </main>
      <Footer />
    </div>
  );
}
