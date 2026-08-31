import Link from "next/link";
import type { Metadata } from "next";
import Navbar from "@/components/nav/Navbar";
import Footer from "@/components/nav/Footer";

export const metadata: Metadata = {
  title: "Web App vs. Web Page — What's the Difference? | Vision Workx",
  description:
    "A web page tells people about your business. A web app runs it — bookings, payments, customers, and workflows, automated. Here's the difference, and why it matters.",
};

const COMPARISON_ROWS = [
  {
    label: "What it does",
    page: "Displays information — hours, services, contact details.",
    app: "Performs work — takes bookings, processes payments, manages customers.",
  },
  {
    label: "Direction",
    page: "One-way. You publish, visitors read.",
    app: "Two-way. Customers act, your business responds — automatically.",
  },
  {
    label: "Data",
    page: "None, or a basic contact form that emails you.",
    app: "A real database — every booking, order, and customer, tracked and searchable.",
  },
  {
    label: "Customer experience",
    page: "\"Call us to book\" or \"email for a quote.\"",
    app: "\"Book instantly,\" 24/7, with confirmation the moment they click.",
  },
  {
    label: "What it replaces",
    page: "A paper brochure — nice to look at.",
    app: "Your spreadsheets, your calendar, your invoicing, your CRM.",
  },
  {
    label: "Value over time",
    page: "Same site, same info, until someone manually edits it.",
    app: "Gets more valuable as your customer and booking history grows.",
  },
];

export default function WebAppVsWebPagePage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar />

      {/* ─── Hero ─── */}
      <section className="relative bg-gradient-to-br from-navy-dark via-[#1e3f6b] to-[#0d1f35] text-white overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="relative max-w-3xl mx-auto px-4 pt-20 pb-16 text-center">
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-blue-300 bg-blue-900/40 border border-blue-700/50 px-4 py-2 rounded-full mb-6">
            The question every business owner should ask first
          </span>
          <h1 className="text-4xl md:text-5xl font-bold leading-[1.1] tracking-tight">
            Web app vs. web page.
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-blue-300">
              They&apos;re not the same thing.
            </span>
          </h1>
          <p className="mt-6 text-lg text-blue-100/80 leading-relaxed">
            A lot of businesses pay for a website and expect it to run their
            business. It won&apos;t. Here&apos;s the actual difference — and
            which one you need.
          </p>
        </div>
      </section>

      {/* ─── Plain-English definitions ─── */}
      <section className="py-20 px-4 bg-off-white">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="bg-white border border-gray-200 rounded-2xl p-8">
            <p className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-2">
              Web Page
            </p>
            <h2 className="text-xl font-bold text-navy-dark mb-3">
              A digital flyer.
            </h2>
            <p className="text-gray-600 leading-relaxed text-sm">
              A web page (or website) is static content — text, images, a
              contact form. It tells visitors who you are and how to reach
              you. Nothing on it changes based on who&apos;s looking, and it
              can&apos;t take an action on a customer&apos;s behalf. It&apos;s
              a brochure that happens to live online.
            </p>
          </div>
          <div className="bg-white border-2 border-navy rounded-2xl p-8 shadow-lg">
            <p className="text-sm font-semibold text-navy uppercase tracking-widest mb-2">
              Web App
            </p>
            <h2 className="text-xl font-bold text-navy-dark mb-3">
              A digital employee.
            </h2>
            <p className="text-gray-600 leading-relaxed text-sm">
              A web app is software — it stores data, remembers customers,
              and does real work: taking a booking, charging a card, sending
              a confirmation, updating a schedule. It runs your business
              while you&apos;re not looking at it.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Comparison table ─── */}
      <section className="py-24 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold text-navy uppercase tracking-widest mb-3">
              Side by Side
            </p>
            <h2 className="text-3xl font-bold text-navy-dark">
              Same internet. Very different jobs.
            </h2>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-off-white text-left">
                  <th className="px-5 py-4 font-semibold text-gray-400 uppercase text-xs tracking-widest w-1/5">
                    &nbsp;
                  </th>
                  <th className="px-5 py-4 font-semibold text-gray-500">Web Page</th>
                  <th className="px-5 py-4 font-semibold text-navy">Web App</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, i) => (
                  <tr
                    key={row.label}
                    className={i % 2 === 0 ? "bg-white" : "bg-off-white/60"}
                  >
                    <td className="px-5 py-4 font-semibold text-navy-dark align-top">
                      {row.label}
                    </td>
                    <td className="px-5 py-4 text-gray-500 align-top">{row.page}</td>
                    <td className="px-5 py-4 text-navy-dark align-top font-medium">
                      {row.app}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ─── Why it matters ─── */}
      <section className="py-24 px-4 bg-off-white">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-sm font-semibold text-navy uppercase tracking-widest mb-3">
            Why It Matters
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-navy-dark mb-6">
            A web page describes your business. A web app runs it.
          </h2>
          <p className="text-gray-600 text-lg leading-relaxed">
            If a customer can&apos;t book, pay, or manage anything without
            calling or emailing you first, you have a web page — and every
            one of those calls and emails is time you&apos;re not getting
            back. A web app closes that gap: customers act on their own,
            around the clock, and the results land directly in a system you
            actually own.
          </p>
        </div>
      </section>

      {/* ─── Why Vision Workx builds apps, not pages ─── */}
      <section className="py-24 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-navy uppercase tracking-widest mb-3">
              Where Vision Workx Fits
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-dark">
              We don&apos;t build web pages. We build web apps.
            </h2>
            <p className="mt-3 text-gray-500 text-lg">
              And we do it in days, not months — for a fraction of an
              agency&apos;s price.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-off-white border border-gray-100 rounded-2xl p-7">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-2xl mb-4">
                🚫
              </div>
              <h3 className="font-bold text-navy-dark mb-2">
                Website builders sell you a page
              </h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Squarespace, Wix, and template sites are built for
                brochures — pretty pages with no memory, no database, and no
                way to actually run your day-to-day operations.
              </p>
            </div>
            <div className="bg-off-white border border-gray-100 rounded-2xl p-7">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-2xl mb-4">
                💸
              </div>
              <h3 className="font-bold text-navy-dark mb-2">
                Agencies sell you an app — slowly
              </h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                A custom-built web app from a dev shop is the right idea, at
                the wrong price and timeline: $15,000+ and months of back
                and forth for most small businesses.
              </p>
            </div>
            <div className="bg-navy-dark text-white rounded-2xl p-7">
              <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl mb-4">
                ⚡
              </div>
              <h3 className="font-bold mb-2">Vision Workx builds the app</h3>
              <p className="text-blue-100/80 text-sm leading-relaxed">
                Describe your business in plain English. Our AI builds a real,
                working web app — booking, payments, customer data, all of it
                — and deploys it live, usually within days.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="py-24 px-4 bg-gradient-to-br from-navy-dark via-[#1e3f6b] to-[#0d1f35] text-white">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Stop pointing customers to a page. Give them an app.
          </h2>
          <p className="text-blue-200 text-lg mb-8 leading-relaxed">
            Start your free 14-day trial today. No credit card needed. No
            developers. No waiting months for an agency.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/signup"
              className="bg-navy hover:bg-blue-500 text-white font-semibold px-8 py-4 rounded-xl text-base transition-colors shadow-lg"
            >
              Start Free Trial — 14 Days Free
            </Link>
            <Link
              href="/#how-it-works"
              className="border border-blue-500/60 text-blue-200 font-semibold px-8 py-4 rounded-xl text-base hover:bg-blue-900/40 transition-colors"
            >
              See How It Works
            </Link>
          </div>

          <p className="mt-6 text-sm text-blue-400">
            No credit card required · Cancel anytime · Setup in minutes
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
