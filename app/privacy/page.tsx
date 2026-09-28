import Navbar from "@/components/nav/Navbar";
import Footer from "@/components/nav/Footer";

export const metadata = {
  title: "Privacy Policy — VisionWorkx",
  description: "How VisionWorkx collects, uses, and protects information, including data collected by VisionWorkx Modules forms.",
};

const LAST_UPDATED = "September 27, 2026";

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

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-off-white flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-12">
        <h1 className="text-3xl font-bold text-navy-dark mb-2">Privacy Policy</h1>
        <p className="text-xs text-gray-400 mb-10">Last updated: {LAST_UPDATED}</p>

        <Section title="Who this covers">
          <p>
            This Privacy Policy explains how Revalor LLC, doing business as VisionWorkx (&ldquo;VisionWorkx,&rdquo; &ldquo;we,&rdquo;
            &ldquo;us,&rdquo; or &ldquo;our&rdquo;), collects, uses and shares information through our website, the VisionWorkx App Builder
            and VisionWorkx Modules (together, the &ldquo;Service&rdquo;). It covers two groups of people differently:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Our customers</strong>: businesses and their staff who sign up for and use the Service. We decide how this information
              is used.
            </li>
            <li>
              <strong>Our customers&apos; visitors</strong>: people who fill in a VisionWorkx form on a customer&apos;s website. Here we act
              as a <strong>service provider (processor)</strong> for that business, which decides how the information is used. Section 3
              explains this.
            </li>
          </ul>
        </Section>

        <Section title="1. Information we collect from customers">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Account and signup information:</strong> your name, email address, business name, website address, the website builder
              you use, and the date and version of the Terms you accepted. Workspace sign-in is passwordless (by emailed link). For the App
              Builder, passwords are stored hashed by our authentication provider.
            </li>
            <li>
              <strong>Business and configuration information:</strong> branding (logo, colors, fonts), business details, form and email
              settings, the website domains your modules run on, and an optional webhook address.
            </li>
            <li>
              <strong>AI prompts:</strong> descriptions you type to generate an app or draft a form.
            </li>
            <li>
              <strong>Payment information:</strong> collected and processed directly by Stripe. We never see or store your full card number.
            </li>
            <li>
              <strong>Usage and log data:</strong> device and browser information, pages used, and service logs, collected automatically to
              operate and secure the Service.
            </li>
          </ul>
        </Section>

        <Section title="2. How we use customer information">
          <p>
            To provide and operate the Service and your Workspace; to process payments and manage subscriptions (including free trials); to
            send service emails (sign-in links, welcome and setup emails, usage-limit warnings, billing and security notices); to provide
            support, including installation help you request; to secure, monitor and improve the Service; and to comply with the law. We
            send product news only if you opt in.
          </p>
        </Section>

        <Section title="3. Information from visitors to our customers' websites (Modules)">
          <p>When someone submits a VisionWorkx form on a customer&apos;s website, we collect on that business&apos;s behalf:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>The information they enter</strong>, for example name, email, phone, message, and any files they upload;
            </li>
            <li>
              <strong>The page address</strong> the form was submitted from;
            </li>
            <li>
              <strong>Email delivery events</strong> for the automatic emails the business has turned on (for example delivered, bounced, or
              unsubscribed), so we can stop emailing people who bounce or opt out.
            </li>
          </ul>
          <p>
            To protect forms from abuse we compute a <strong>one-way, salted hash of the visitor&apos;s IP address</strong> for rate limiting.
            We don&apos;t store the raw IP address with submissions, and rate-limit records are cleared automatically within about an hour.
          </p>
          <p>
            We use visitor information <strong>only</strong> to provide the Service to the business: storing the submission, showing it in
            their Workspace, sending the automatic reply and notification emails they configured, delivering it to their webhook if they set
            one, and preventing abuse. We <strong>don&apos;t</strong> sell it, use it for our own marketing, or use it to train AI models.
            Visitor submissions are <strong>not</strong> sent to our AI provider.
          </p>
          <p>
            The business is responsible for telling its visitors how their information is used.{" "}
            <strong>
              If you submitted a form on a business&apos;s website and want to access or delete your information, please contact that
              business;
            </strong>{" "}
            we&apos;ll help them respond. You can also reach us at <Email /> and we&apos;ll pass your request on. Every automatic email
            includes an unsubscribe link.
          </p>
        </Section>

        <Section title="4. How we share information">
          <p>We share information only with service providers that process it on our behalf:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Supabase</strong>: database, authentication and file storage (hosted in the United States);
            </li>
            <li>
              <strong>Vercel</strong>: application hosting and infrastructure;
            </li>
            <li>
              <strong>Stripe</strong>: payment processing and billing (customers only);
            </li>
            <li>
              <strong>Resend</strong>: email delivery (sign-in links, notifications, and automatic emails to visitors);
            </li>
            <li>
              <strong>Anthropic</strong>: AI model used to generate apps and draft forms from <strong>customer</strong> prompts and business
              details (never visitor submissions).
            </li>
          </ul>
          <p>
            A customer&apos;s webhook, if configured, sends that customer&apos;s submissions to the address the customer chooses. We don&apos;t
            sell personal information or share it for cross-context behavioral advertising. We may disclose information if required by law,
            to protect rights and safety, or as part of a merger, acquisition or sale of assets under confidentiality protections.
          </p>
        </Section>

        <Section title="5. Cookies">
          <p>
            We use essential cookies to keep customers signed in and to run the Service. We don&apos;t use advertising or cross-site tracking
            cookies. <strong>VisionWorkx forms embedded on customer websites don&apos;t set cookies on visitors.</strong>
          </p>
        </Section>

        <Section title="6. Data retention">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Customer account information:</strong> while your account is active, then as long as reasonably needed for legal, tax,
              accounting or dispute purposes.
            </li>
            <li>
              <strong>Visitor submissions and files:</strong> kept for the business while its subscription is active. The business can delete
              them. After a subscription ends, they&apos;re kept for 30 days so the business can export them, then deleted.
            </li>
            <li>
              <strong>Unfinished uploads</strong> (files uploaded to a form that was never submitted) are deleted automatically after 24
              hours.
            </li>
            <li>
              <strong>Email suppression records</strong> (addresses that bounced or unsubscribed) are kept so we don&apos;t email them again.
            </li>
          </ul>
        </Section>

        <Section title="7. Where information is stored">
          <p>
            The Service is operated from, and data is stored in, the <strong>United States</strong>. A Data Processing Addendum is available
            on request for customers who need one.
          </p>
        </Section>

        <Section title="8. Your rights">
          <p>
            Depending on where you live, you may have the right to access, correct, delete or export your personal information, or to object
            to or limit certain processing. Customers can export their submissions from the Workspace at any time. To make a request, email{" "}
            <Email />; we&apos;ll verify your identity before acting. We won&apos;t discriminate against you for exercising your rights.
          </p>
        </Section>

        <Section title="9. Children">
          <p>
            The Service is for businesses and is not directed at children under 16. Customers may not use modules on sites directed at
            children under 13. We don&apos;t knowingly collect information from children.
          </p>
        </Section>

        <Section title="10. Security">
          <p>
            We use encrypted connections, access-controlled infrastructure and isolation between customers&apos; Workspaces (each business can
            see only its own data). No system is perfectly secure, and we can&apos;t guarantee absolute security. We&apos;ll notify affected
            customers of a security incident involving their data as required by law.
          </p>
        </Section>

        <Section title="11. Revalor Social Manager">
          <p>
            Revalor Social Manager, our internal social media management tool, connects to Facebook Pages and Instagram Business Accounts
            that we own and administer, to schedule and publish content on our own behalf. We access basic account information (Page/account
            ID, username) and use publishing permissions solely to post approved content to our own connected accounts. We do not access,
            store or process Meta account data belonging to any other individual or business.
          </p>
        </Section>

        <Section title="12. Google Calendar (VisionWorkx booking)">
          <p>
            A business using a VisionWorkx booking module can choose to connect its Google Calendar. With the business owner&apos;s
            permission we access, from their Google account:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Their email address</strong>, to show which Google account is connected.
            </li>
            <li>
              <strong>Free/busy times</strong> on their primary calendar (start and end times only, never event titles, attendees or
              other details), so their booking page doesn&apos;t offer times they&apos;re already busy.
            </li>
            <li>
              <strong>Events we create</strong> on their primary calendar: one per booking made through VisionWorkx, which we update when
              the booking is rescheduled and remove when it&apos;s cancelled. We don&apos;t read, change or delete any other events.
            </li>
          </ul>
          <p>
            We store only an encrypted Google access credential, the connected email address, and the ID of each event we created. We don&apos;t sell
            Google user data, use it for advertising, share it with third parties (other than the service providers that host
            VisionWorkx), or use it to train AI or machine-learning models, and people at Revalor don&apos;t read it except to
            provide support the business asks for, for security, or where the law requires it. The business can disconnect at any time
            from Workspace Settings (or from their Google Account&apos;s third-party access page), which revokes our access and deletes
            the stored token.
          </p>
          <p>
            VisionWorkx&apos;s use and transfer of information received from Google APIs to any other app will adhere to the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              className="text-navy underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </Section>

        <Section title="13. Changes">
          <p>
            We may update this Privacy Policy. For material changes we&apos;ll update the date above and notify customers by email.
          </p>
        </Section>

        <Section title="14. Contact">
          <p>
            Questions about this Privacy Policy? Reach us at <Email />.
          </p>
        </Section>
      </main>
      <Footer />
    </div>
  );
}
