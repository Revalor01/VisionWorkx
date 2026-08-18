import Navbar from "@/components/nav/Navbar";
import Footer from "@/components/nav/Footer";

export const metadata = {
  title: "Data Deletion Instructions — Vision Workx",
  description: "How to request deletion of your data from Vision Workx.",
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

export default function DataDeletionPage() {
  return (
    <div className="min-h-screen bg-off-white flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-12">
        <h1 className="text-3xl font-bold text-navy-dark mb-2">Data Deletion Instructions</h1>
        <p className="text-xs text-gray-400 mb-10">Last updated: {LAST_UPDATED}</p>

        <Section title="How to Request Deletion">
          <p>
            To request deletion of your personal information from Vision Workx, email{" "}
            <a href="mailto:info@revalorllc.com" className="text-navy underline">
              info@revalorllc.com
            </a>{" "}
            from the email address associated with your account, with the subject line &ldquo;Data Deletion
            Request.&rdquo; We&apos;ll confirm your identity and process the request as described below.
          </p>
        </Section>

        <Section title="What Gets Deleted">
          <p>
            Upon a verified request, we delete your account information, the business information you provided,
            and any generated app(s) tied to your account, subject to the retention exceptions described in our{" "}
            <a href="/privacy" className="text-navy underline">
              Privacy Policy
            </a>{" "}
            (legal, accounting, or dispute-resolution records may be retained briefly where required). Deletion
            is typically completed within 30 days of a verified request.
          </p>
        </Section>

        <Section title="Facebook and Instagram Data">
          <p>
            Revalor Social Manager, our internal social media management tool, only connects to Facebook Pages
            and Instagram Business Accounts that Revalor LLC itself owns and administers — it does not offer
            &ldquo;Login with Facebook&rdquo; to end users and does not collect or store Facebook/Instagram data
            belonging to any other individual or business. If you believe we hold Meta Platform Data about you
            in error, contact us at the email above and we&apos;ll investigate and delete it as appropriate.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this process? Reach us at{" "}
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
