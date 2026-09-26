import Link from "next/link";
import Image from "next/image";
import Navbar from "@/components/nav/Navbar";
import Footer from "@/components/nav/Footer";
import ModuleForm from "@/components/modules/ModuleForm";
import { parseFormConfig } from "@/lib/modules/config";
import { PLAN_LIMITS, PLAN_PRICE, PLANS, TRIAL_DAYS, type ModulePlan } from "@/lib/modules/plans";

// VisionWorkx marketing page — embeddable modules for the website a business
// already has. (The old full-app builder is frozen; see docs/full-app-generation-freeze.md.)

const WAITLIST = "https://products.revalorllc.com/visionworkx/waitlist";
const PREVIEW = "https://products.revalorllc.com/visionworkx/preview";

const BUILDERS = ["WordPress", "Squarespace", "Wix", "Webflow", "Framer", "Shopify"];

const STEPS = [
  {
    n: "1",
    title: "Describe it",
    body: "Tell us what you need in a sentence — “a quote request for plumbing jobs, with the address and a photo.” VisionWorkx drafts the form for you.",
  },
  {
    n: "2",
    title: "Make it yours",
    body: "Change any question, add your logo, colors and wording. A live preview shows exactly what your visitors will see.",
  },
  {
    n: "3",
    title: "Paste one line",
    body: "Copy a single line of code into your site builder. It loads in the background and never slows down or breaks your page.",
  },
];

const MODULES = [
  {
    name: "Lead capture",
    status: "First to launch",
    body: "Quote requests and contact forms with the questions you choose — including photo and document uploads up to 10 MB.",
  },
  {
    name: "Online booking",
    status: "Coming soon",
    body: "Customers pick an open time, in their own time zone. No double-booking, with reminders and easy rescheduling.",
  },
  {
    name: "Quote calculator",
    status: "Coming soon",
    body: "Visitors see an instant price range from the prices you set, then send you their details for the exact quote.",
  },
  {
    name: "Intake form",
    status: "Coming soon",
    body: "Multi-step onboarding with document uploads and signed consent, stored privately for your business.",
  },
];

const DASHBOARD = [
  "Every lead, booking and form in one list",
  "Mark each one New, Contacted, Won or Lost",
  "Notes for your team on every submission",
  "Download everything as a spreadsheet (CSV)",
  "Send submissions on to the tools you already use",
  "Separate logins for owners and staff",
];

const PLAN_FEATURES = (p: ModulePlan) => {
  const l = PLAN_LIMITS[p];
  return [
    `${l.modules} modules`,
    `${l.submissionsPerMonth.toLocaleString()} submissions a month`,
    `${l.emailsPerMonth.toLocaleString()} automatic emails a month`,
    `${l.storageBytes / 1024 ** 3} GB file storage`,
    `${l.aiDraftsPerMonth} AI form drafts a month`,
  ];
};

const FAQ = [
  {
    q: "Do I need a new website?",
    a: "No. VisionWorkx adds to the site you already have. If you can paste text into your site builder, you can install a module — and Revalor can install it for you.",
  },
  {
    q: "Will it look like my site?",
    a: "Yes. Every module uses your logo, colors, fonts and wording. It's styled to fit in, and your site's styles can't break it.",
  },
  {
    q: "What happens when someone fills it in?",
    a: "Your customer gets an instant confirmation from your business name, you get an alert with every detail, and the submission lands in your dashboard.",
  },
  {
    q: "Who can see my customers' information?",
    a: "Only you and the staff you invite. Submissions are stored privately for your business, uploaded files are never public, and nothing is shared across businesses.",
  },
  {
    q: "What does it cost?",
    a: "Starter is $59 a month, Growth $129 and Pro $299 — or save 20% paying yearly. Every plan starts with a 14-day free trial, and you can cancel any time before it ends.",
  },
];

const DEMO_FORM = parseFormConfig({
  title: "Request a free quote",
  intro: "Tell us what you need and we'll get back to you within one business day.",
  submitLabel: "Send my request",
  successMessage: "Thanks — this is a preview, so nothing was sent.",
  fields: [
    { id: "name", label: "Full name", type: "text", required: true },
    { id: "email", label: "Email", type: "email", required: true },
    { id: "service", label: "What do you need?", type: "select", required: true, options: ["Leak or repair", "Water heater", "Drain cleaning", "Something else"] },
    { id: "photo", label: "Photo of the problem", type: "file" },
  ],
});

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-navy-dark via-[#1e3f6b] to-[#0d1f35] text-white">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-24">
          <div>
            <div className="mb-5 flex items-center gap-3">
              <Image src="/VisionWorks.png" alt="VisionWorkx" width={56} height={56} className="rounded-xl bg-white p-1" priority />
              <span className="text-xs font-semibold uppercase tracking-widest text-blue-200">A Revalor Business product</span>
            </div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-balance sm:text-5xl">
              Add booking, lead capture and automatic follow-up to the website you already have.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-blue-100">
              Just describe it. VisionWorkx builds the module, matches your branding, and emails every customer back the moment they reach out.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <a href={WAITLIST} className="rounded-xl bg-white px-6 py-3 font-semibold text-navy-dark shadow-lg hover:bg-blue-50">
                Join the waitlist →
              </a>
              <a href={PREVIEW} className="font-semibold text-blue-100 underline decoration-blue-400/50 underline-offset-4 hover:text-white">
                See every module on a real website
              </a>
            </div>
            <div className="mt-8">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-blue-300">Works on</p>
              <ul className="flex flex-wrap gap-2" aria-label="Supported website builders">
                {BUILDERS.map((b) => (
                  <li key={b} className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm text-blue-50">
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="relative">
            <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10">
              <div className="mb-2 flex items-center gap-2 px-2 text-xs text-blue-200">
                <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <span className="ml-2 font-mono">yourbusiness.com/get-a-quote</span>
                <span className="ml-auto rounded bg-white/10 px-1.5 py-0.5">Live preview</span>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <ModuleForm
                  publicId="m_000000000000000000"
                  businessName="Harbor Plumbing"
                  logoUrl={null}
                  brand={{ color: "#1b2542", font: "modern", radius: 10 }}
                  config={DEMO_FORM}
                  sourceUrl={null}
                  preview
                />
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-blue-200">This is the real form, running in preview mode. Try it — nothing is sent.</p>
          </div>
        </div>
      </section>

      {/* ─── How it works ─── */}
      <section id="how-it-works" className="bg-white px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-navy">How it works</p>
          <h2 className="mt-2 max-w-2xl text-3xl font-bold text-navy-dark text-balance">From a sentence to a working form on your site in minutes.</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-2xl border border-gray-200 p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy text-sm font-bold text-white" aria-hidden="true">
                  {s.n}
                </span>
                <h3 className="mt-4 text-lg font-bold text-navy-dark">{s.title}</h3>
                <p className="mt-2 text-gray-600">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ─── Modules ─── */}
      <section id="modules" className="bg-off-white px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-navy">Modules</p>
          <h2 className="mt-2 max-w-2xl text-3xl font-bold text-navy-dark text-balance">Pick what your site is missing. Add more any time.</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {MODULES.map((m) => (
              <article key={m.name} className="rounded-2xl border border-gray-200 bg-white p-6">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-bold text-navy-dark">{m.name}</h3>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      m.status === "First to launch" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {m.status}
                  </span>
                </div>
                <p className="mt-2 text-gray-600">{m.body}</p>
              </article>
            ))}
          </div>
          <p className="mt-8 text-center">
            <a href={PREVIEW} className="font-semibold text-navy hover:underline">
              See each module on a real website →
            </a>
          </p>
        </div>
      </section>

      {/* ─── Automation ─── */}
      <section id="automation" className="bg-navy-dark px-4 py-20 text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-blue-300">VisionWorkx Automation · included</p>
            <h2 className="mt-2 text-3xl font-bold text-balance">Every customer hears back in seconds. You never miss a lead.</h2>
            <p className="mt-4 text-blue-100">
              The moment a form is sent, your customer gets a friendly confirmation from your business name and you get an alert with every detail. Reply to either email to reach the other person directly. Add a follow-up a day or two later with one switch.
            </p>
            <ul className="mt-6 space-y-2 text-blue-50">
              <li>✓ Written in your words — edit every email</li>
              <li>✓ Sent from your business name, or your own domain</li>
              <li>✓ Unsubscribe and bounce handling built in</li>
            </ul>
          </div>
          <div>
            <p className="mb-3 text-sm font-semibold text-blue-200">Automatic emails each month, included</p>
            <dl className="grid grid-cols-3 gap-3">
              {PLANS.map((p) => (
                <div key={p} className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
                  <dt className="text-xs uppercase tracking-widest text-blue-300">{PLAN_PRICE[p].label}</dt>
                  <dd className="mt-1 text-2xl font-bold tabular-nums">{PLAN_LIMITS[p].emailsPerMonth.toLocaleString()}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm text-blue-200">
              Enough for a confirmation and an alert on every submission your plan includes.{" "}
              <a href="#pricing" className="underline underline-offset-2 hover:text-white">See pricing</a>
            </p>
          </div>
        </div>
      </section>

      {/* ─── Dashboard ─── */}
      <section id="dashboard" className="bg-white px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-navy">Your dashboard</p>
          <h2 className="mt-2 max-w-2xl text-3xl font-bold text-navy-dark text-balance">Everything your website collects, in one place.</h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DASHBOARD.map((d) => (
              <li key={d} className="rounded-xl border border-gray-200 p-4 text-gray-700">
                {d}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ─── Pricing ─── */}
      <section id="pricing" className="bg-off-white px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-navy">Pricing</p>
          <h2 className="mt-2 text-3xl font-bold text-navy-dark text-balance">Simple plans. Every one starts with a {TRIAL_DAYS}-day free trial.</h2>
          <p className="mt-3 max-w-2xl text-gray-600">
            Every plan includes automatic emails, your dashboard, your own branding and spam protection. Pay monthly, or save 20% paying yearly.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {PLANS.map((p) => {
              const price = PLAN_PRICE[p];
              const featured = p === "growth";
              return (
                <article key={p} className={`relative rounded-2xl bg-white p-7 ${featured ? "ring-2 ring-navy shadow-lg" : "ring-1 ring-gray-200"}`}>
                  {featured && (
                    <span className="absolute -top-3 left-7 rounded-full bg-navy px-3 py-1 text-xs font-semibold text-white">Most popular</span>
                  )}
                  <h3 className="text-lg font-bold text-navy-dark">{price.label}</h3>
                  <p className="mt-3">
                    <span className="text-4xl font-bold tabular-nums text-gray-900">${price.monthly}</span>
                    <span className="text-gray-500">/month</span>
                  </p>
                  <p className="text-sm text-gray-500 tabular-nums">or ${price.annual.toLocaleString()}/year — save 20%</p>
                  <ul className="mt-6 space-y-2 text-sm text-gray-700">
                    {PLAN_FEATURES(p).map((f) => (
                      <li key={f}>✓ {f}</li>
                    ))}
                  </ul>
                  <a
                    href={WAITLIST}
                    className={`mt-7 block rounded-xl py-3 text-center font-semibold ${featured ? "bg-navy-dark text-white hover:bg-navy" : "border border-gray-300 text-navy-dark hover:bg-gray-50"}`}
                  >
                    Join the waitlist
                  </a>
                </article>
              );
            })}
          </div>
          <p className="mt-6 text-center text-sm text-gray-500">
            {TRIAL_DAYS}-day free trial on every plan · card required, charged only after the trial · cancel any time. Busy month? We keep saving submissions up to 50% over your plan and let you know, so you never lose a customer.
          </p>
        </div>
      </section>

      {/* ─── Done for you ─── */}
      <section id="done-for-you" className="bg-off-white px-4 py-20">
        <div className="mx-auto max-w-4xl rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-gray-200 sm:p-12">
          <h2 className="text-2xl font-bold text-navy-dark text-balance">Rather not touch your website? We&apos;ll install it for you.</h2>
          <p className="mx-auto mt-3 max-w-2xl text-gray-600">
            Revalor sets up your modules, matches your branding and installs them on your site. Need something bigger? Revalor Consulting builds custom tools — and can include VisionWorkx modules.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <a href={WAITLIST} className="rounded-xl bg-navy-dark px-6 py-3 font-semibold text-white hover:bg-navy">
              Join the waitlist
            </a>
            <a href="https://products.revalorllc.com/consulting" className="rounded-xl border border-gray-300 px-6 py-3 font-semibold text-navy-dark hover:bg-gray-50">
              Revalor Consulting
            </a>
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section id="faq" className="bg-white px-4 py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold text-navy-dark">Questions</h2>
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

      {/* ─── Final CTA ─── */}
      <section className="bg-gradient-to-br from-navy-dark via-[#1e3f6b] to-[#0d1f35] px-4 py-20 text-center text-white">
        <h2 className="mx-auto max-w-2xl text-3xl font-bold text-balance">Your website, doing more of the work.</h2>
        <p className="mx-auto mt-3 max-w-xl text-blue-100">VisionWorkx is launching soon. Join the waitlist to be first in line.</p>
        <a href={WAITLIST} className="mt-8 inline-block rounded-xl bg-white px-8 py-3 font-semibold text-navy-dark hover:bg-blue-50">
          Join the waitlist →
        </a>
        <p className="mt-6 text-sm text-blue-200">A Revalor Business product · Veteran-owned</p>
      </section>

      <Footer />
    </div>
  );
}
