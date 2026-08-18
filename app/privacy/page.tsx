import Navbar from "@/components/nav/Navbar";
import Footer from "@/components/nav/Footer";

export const metadata = {
  title: "Privacy Policy — Vision Workx",
  description: "How Vision Workx collects, uses, and protects your data.",
};

const LAST_UPDATED = "August 18, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-navy-dark mb-3">{title}</h2>
      <div className="space-y-3 text-sm text-gray-600 leading-relaxed">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-off-white flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-12">
        <h1 className="text-3xl font-bold text-navy-dark mb-2">Privacy Policy</h1>
        <p className="text-xs text-gray-400 mb-10">Last updated: {LAST_UPDATED}</p>

        <Section title="1. Who We Are">
          <p>
            This Privacy Policy explains how Revalor LLC, doing business as Vision Workx (&ldquo;Vision
            Workx,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;), collects, uses, and shares
            information when you use our website and app generation/hosting platform (the
            &ldquo;Service&rdquo;). It applies to visitors to our marketing site and to registered customers.
          </p>
        </Section>

        <Section title="2. Information We Collect">
          <p>
            <span className="font-semibold text-navy-dark">Account information:</span> name, email address, and
            password (stored securely, hashed, via our authentication provider) when you sign up.
          </p>
          <p>
            <span className="font-semibold text-navy-dark">Business information:</span> the details you provide
            about your business when generating an app — business name, description, location, branding
            (logo, colors, fonts), and any photos or social links you add — which we use to build and operate
            your generated app.
          </p>
          <p>
            <span className="font-semibold text-navy-dark">Payment information:</span> when you subscribe to a
            paid plan, billing details are collected and processed directly by Stripe, our payment processor.
            We do not store your full card number on our own servers.
          </p>
          <p>
            <span className="font-semibold text-navy-dark">Usage data:</span> log data, device/browser
            information, and how you interact with the Service, collected automatically to operate and improve
            it.
          </p>
          <p>
            <span className="font-semibold text-navy-dark">End-customer data:</span> if your generated app
            collects information from your own customers (for example, bookings or leads), that data belongs to
            you and is subject to your own privacy practices toward your customers — we process it on your
            behalf as a service provider.
          </p>
        </Section>

        <Section title="3. How We Use Information">
          <ul className="list-disc pl-5 space-y-1">
            <li>To create and operate your account and generated app(s);</li>
            <li>To process payments and manage subscriptions;</li>
            <li>To send transactional emails (account, billing, booking notifications) and, where you&apos;ve opted in, product updates;</li>
            <li>To provide customer support;</li>
            <li>To monitor, secure, and improve the Service;</li>
            <li>To comply with legal obligations.</li>
          </ul>
          <p>
            Business information you provide is also sent to our AI provider (Anthropic) as part of generating
            your app&apos;s code and content — see Section 4.
          </p>
        </Section>

        <Section title="4. Third-Party Service Providers">
          <p>
            We share information with the following categories of service providers, solely to operate the
            Service on our behalf:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><span className="font-semibold text-navy-dark">Supabase</span> — database, authentication, and file storage;</li>
            <li><span className="font-semibold text-navy-dark">Vercel</span> — application hosting and infrastructure;</li>
            <li><span className="font-semibold text-navy-dark">Stripe</span> — payment processing and billing;</li>
            <li><span className="font-semibold text-navy-dark">Resend</span> — transactional email delivery;</li>
            <li><span className="font-semibold text-navy-dark">Anthropic</span> — AI model used to generate app code and content from the business information you provide.</li>
          </ul>
          <p>
            We don&apos;t sell your personal information. We may disclose information if required by law, to
            protect our rights, or in connection with a merger, acquisition, or sale of assets, subject to
            standard confidentiality protections.
          </p>
        </Section>

        <Section title="5. Cookies">
          <p>
            We use essential cookies to keep you logged in and to operate core site functionality. We do not
            currently use third-party advertising or cross-site tracking cookies on the Vision Workx marketing
            site or dashboard.
          </p>
        </Section>

        <Section title="6. Data Retention">
          <p>
            We retain account and business information for as long as your account is active. If you delete an
            app or close your account, we retain data only as long as reasonably necessary for legal,
            accounting, or dispute-resolution purposes, after which it is deleted or anonymized.
          </p>
        </Section>

        <Section title="7. Your Rights">
          <p>
            Depending on where you live, you may have rights to access, correct, delete, or export your
            personal information, or to object to certain processing. To exercise these rights, contact us at{" "}
            <a href="mailto:info@revalorllc.com" className="text-navy underline">
              info@revalorllc.com
            </a>
            . [Region-specific rights language — e.g. GDPR/CCPA — to be confirmed based on where customers are
            located.]
          </p>
        </Section>

        <Section title="8. Children's Privacy">
          <p>
            The Service is intended for business owners and is not directed at children under 16. We do not
            knowingly collect personal information from children.
          </p>
        </Section>

        <Section title="9. Security">
          <p>
            We use reasonable technical and organizational measures — including encrypted connections and
            access-controlled infrastructure — to protect your information. No method of transmission or
            storage is 100% secure, and we can&apos;t guarantee absolute security.
          </p>
        </Section>

        <Section title="10. Changes to This Policy">
          <p>
            We may update this Privacy Policy from time to time. If we make material changes, we&apos;ll update
            the &ldquo;Last updated&rdquo; date above and, where required, notify you directly.
          </p>
        </Section>

        <Section title="11. Facebook and Instagram Integration">
          <p>
            Revalor Social Manager, our internal social media management tool, connects to Facebook Pages and
            Instagram Business Accounts that we own and administer, in order to schedule and publish content on
            our own behalf. We access basic account information (Page/account ID, username) and use publishing
            permissions solely to post approved content to our own connected accounts. We do not access, store,
            or process Meta account data belonging to any other individual or business.
          </p>
        </Section>

        <Section title="12. Contact">
          <p>
            Questions about this Privacy Policy? Reach us at{" "}
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
