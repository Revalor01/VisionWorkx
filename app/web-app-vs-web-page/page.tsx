import Link from "next/link";
import type { Metadata } from "next";
import Navbar from "@/components/nav/Navbar";
import Footer from "@/components/nav/Footer";

const WAITLIST = "https://products.revalorllc.com/visionworkx/waitlist";
const PREVIEW = "https://products.revalorllc.com/visionworkx/preview";
const CONSULTING = "https://products.revalorllc.com/consulting";

export const metadata: Metadata = {
  title: "Web App vs. Web Page — What's the Difference, and Which Do You Need? | VisionWorkx",
  description:
    "A web page tells people about your business. A web app does work for it — bookings, quote requests, follow-ups. Here's the difference, and how to get the working parts without rebuilding your website.",
  alternates: { canonical: "/web-app-vs-web-page" },
};

const COMPARISON_ROWS = [
  {
    label: "What it does",
    page: "Shows information — who you are, your services, hours and contact details.",
    app: "Does work — takes a booking, collects a quote request, sends a confirmation.",
  },
  {
    label: "Direction",
    page: "One-way. You publish, visitors read.",
    app: "Two-way. A customer acts, and your business responds — automatically.",
  },
  {
    label: "What it remembers",
    page: "Nothing, or a contact form that drops an email in your inbox.",
    app: "Every request, booking and customer, organised and searchable.",
  },
  {
    label: "The customer's experience",
    page: "“Call us to book” or “email us for a quote.”",
    app: "“Book now” or “get my quote,” any time of day, with an instant confirmation.",
  },
  {
    label: "Best at",
    page: "Being found, looking professional, telling your story.",
    app: "Saving you time on the same tasks, every single day.",
  },
];

const JOBS = [
  { job: "Let customers book a time", module: "Online booking" },
  { job: "Collect quote or service requests (with photos)", module: "Lead capture" },
  { job: "Give visitors an instant price range", module: "Quote calculator" },
  { job: "Gather details and documents before a first meeting", module: "Intake form" },
  { job: "Reply to every customer the moment they reach out", module: "Automatic emails (included)" },
  { job: "Keep every request in one place, with a status", module: "Dashboard (included)" },
];

const FAQ = [
  {
    q: "Is a website a web page or a web app?",
    a: "Most small-business websites are collections of web pages: they describe the business. The parts that take an action for a customer — a booking calendar, a quote form that files the request and replies automatically — are web-app features, even when they sit on an ordinary page.",
  },
  {
    q: "Do I need a web app for my small business?",
    a: "Usually you need a few web-app jobs, not a whole custom app. If you want customers to book, request quotes, or send you their details without phoning, you can add those features to the website you already have.",
  },
  {
    q: "Can I add web-app features to Squarespace, Wix or WordPress?",
    a: "Yes. Tools like VisionWorkx install on WordPress, Squarespace, Wix, Webflow, Framer and Shopify with one line of code, and carry your own branding.",
  },
  {
    q: "When is a custom web app worth it?",
    a: "When your business needs something unusual: customer logins with their own records, a custom workflow, connections between several systems, or a product of its own. That's custom software, and it's worth scoping properly with a development team.",
  },
];

export default function WebAppVsWebPagePage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

      {/* ─── Hero ─── */}
      <section className="bg-gradient-to-br from-navy-dark via-[#1e3f6b] to-[#0d1f35] px-4 py-20 text-white">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-300">The question to ask before you spend on software</p>
          <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-balance md:text-5xl">
            Web app vs. web page: what&apos;s the difference, and which do you need?
          </h1>
          <p className="mt-5 text-lg text-blue-100">
            A web page tells people about your business. A web app does work for it. Most small businesses need a bit of both — and
            you can usually get the working parts without replacing the website you already have.
          </p>
        </div>
      </section>

      {/* ─── Definitions ─── */}
      <section className="bg-off-white px-4 py-16">
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2">
          <article className="rounded-2xl border border-gray-200 bg-white p-7">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Web page</p>
            <h2 className="mt-2 text-xl font-bold text-navy-dark">Your storefront window.</h2>
            <p className="mt-3 text-gray-600">
              A web page is content: words, photos, your services, how to reach you. It&apos;s how people find you and decide to trust
              you. It shows the same thing to everyone, and it can&apos;t act on a customer&apos;s behalf.
            </p>
          </article>
          <article className="rounded-2xl border border-gray-200 bg-white p-7">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Web app</p>
            <h2 className="mt-2 text-xl font-bold text-navy-dark">Your front desk, open 24/7.</h2>
            <p className="mt-3 text-gray-600">
              A web app is software. It takes an action — books an appointment, files a quote request, sends a confirmation — and
              remembers it. It keeps working when you&apos;re with a customer, on a job, or asleep.
            </p>
          </article>
        </div>
      </section>

      {/* ─── Comparison ─── */}
      <section className="bg-white px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-navy">Side by side</p>
          <h2 className="mt-2 text-3xl font-bold text-navy-dark">Same internet. Different jobs.</h2>
          <div className="mt-8 overflow-x-auto rounded-2xl border border-gray-200">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">
                    <span className="sr-only">Aspect</span>
                  </th>
                  <th className="px-5 py-3 font-semibold">Web page</th>
                  <th className="px-5 py-3 font-semibold">Web app</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.label} className="border-t border-gray-100 align-top">
                    <th scope="row" className="px-5 py-4 font-semibold text-navy-dark">
                      {row.label}
                    </th>
                    <td className="px-5 py-4 text-gray-600">{row.page}</td>
                    <td className="px-5 py-4 text-gray-800">{row.app}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ─── The middle path ─── */}
      <section className="bg-off-white px-4 py-20">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-navy">The middle path</p>
          <h2 className="mt-2 max-w-3xl text-3xl font-bold text-navy-dark text-balance">
            You don&apos;t have to choose. Give the page you have a few web-app jobs.
          </h2>
          <p className="mt-4 max-w-3xl text-gray-600">
            Your website is probably doing its job as a web page just fine. What most businesses are missing is the handful of
            things a customer wants to <em>do</em> — book, ask for a quote, send details — without picking up the phone. Those can
            be added as small pieces of software that live on your existing pages.
          </p>
          <div className="mt-8 overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">If you want your website to…</th>
                  <th className="px-5 py-3 font-semibold">Add this</th>
                </tr>
              </thead>
              <tbody>
                {JOBS.map((j) => (
                  <tr key={j.job} className="border-t border-gray-100">
                    <td className="px-5 py-3 text-gray-800">{j.job}</td>
                    <td className="px-5 py-3 font-semibold text-navy-dark">{j.module}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-6 text-gray-600">
            That&apos;s what <strong>VisionWorkx</strong> does: ready-made modules for WordPress, Squarespace, Wix, Webflow, Framer
            and Shopify. Describe what you need in plain English, match it to your brand, and paste one line of code.
          </p>
          <div className="mt-6 flex flex-wrap gap-4">
            <a href={PREVIEW} className="rounded-xl bg-navy-dark px-5 py-3 font-semibold text-white hover:bg-navy">
              See the modules on a real website
            </a>
            <a href={WAITLIST} className="rounded-xl border border-gray-300 bg-white px-5 py-3 font-semibold text-navy-dark hover:bg-gray-50">
              Join the waitlist
            </a>
          </div>
        </div>
      </section>

      {/* ─── When a custom app is worth it ─── */}
      <section className="bg-white px-4 py-20">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-navy">An honest answer</p>
          <h2 className="mt-2 text-3xl font-bold text-navy-dark">When you really do need a custom web app</h2>
          <p className="mt-4 text-gray-600">Add-on modules cover the common jobs. You&apos;re in custom-software territory when you need:</p>
          <ul className="mt-4 space-y-2 text-gray-700">
            <li>• Customer logins where each person sees their own records, orders or documents</li>
            <li>• A workflow that&apos;s specific to how your business runs</li>
            <li>• Several systems talking to each other (accounting, inventory, scheduling)</li>
            <li>• A product of your own that you&apos;ll offer to others</li>
          </ul>
          <p className="mt-4 text-gray-600">
            That&apos;s worth scoping properly. <a href={CONSULTING} className="font-semibold text-navy hover:underline">Revalor Consulting</a>{" "}
            builds custom web apps end to end — and will tell you on the first call if a module would do the job for less.
          </p>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="bg-off-white px-4 py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold text-navy-dark">Common questions</h2>
          <div className="mt-8 divide-y divide-gray-200 border-y border-gray-200">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-navy-dark">
                  {f.q}
                  <span className="text-gray-400 transition group-open:rotate-45" aria-hidden="true">
                    +
                  </span>
                </summary>
                <p className="mt-2 text-gray-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="bg-gradient-to-br from-navy-dark via-[#1e3f6b] to-[#0d1f35] px-4 py-20 text-center text-white">
        <h2 className="mx-auto max-w-2xl text-3xl font-bold text-balance">Keep your website. Give it a front desk.</h2>
        <p className="mx-auto mt-3 max-w-xl text-blue-100">
          VisionWorkx adds booking, lead capture and automatic follow-up to the site you already have. Launching soon.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <a href={WAITLIST} className="rounded-xl bg-white px-6 py-3 font-semibold text-navy-dark hover:bg-blue-50">
            Join the waitlist →
          </a>
          <Link href="/#how-it-works" className="rounded-xl border border-white/30 px-6 py-3 font-semibold text-white hover:bg-white/10">
            How it works
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
