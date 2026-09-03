import Link from "next/link";
import Image from "next/image";
import Navbar from "@/components/nav/Navbar";
import Footer from "@/components/nav/Footer";
import HeroEmailForm from "@/components/landing/HeroEmailForm";
import PricingSection from "@/components/landing/PricingSection";

const EXAMPLES = [
  {
    name: "Green Blade Lawn Care",
    category: "Booking & Scheduling",
    image: "/examples/green-blade-lawn-care.png",
    url: "https://vw-green-blade-lawn-care-booking-c0640777-hxd7fq3op.vercel.app",
  },
  {
    name: "Peak Performance Gym",
    category: "Booking & Scheduling",
    image: "/examples/peak-performance-gym.png",
    url: "https://vw-peak-performance-gym-e5fcbdd6-7ezzlq9dp-vision-workx.vercel.app",
  },
  {
    name: "Sunny Day Spa",
    category: "Booking & Scheduling",
    image: "/examples/sunny-day-spa.png",
    url: "https://vw-sunny-day-spa-booking-app-741aa936-borvjp7w8-vision-workx.vercel.app",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    icon: "✏️",
    title: "Describe Your App",
    body: "Tell us your business name, type, and what your app needs to do. No technical jargon required — plain English works perfectly.",
    tag: "5 minutes",
  },
  {
    step: "02",
    icon: "⚡",
    title: "AI Generates It",
    body: "Our AI builds a complete, production-ready web app tailored to your exact requirements — code, design, and database included.",
    tag: "~10 minutes",
  },
  {
    step: "03",
    icon: "🚀",
    title: "Go Live Instantly",
    body: "Your app deploys automatically with your branding — on your own custom domain when you're ready. Share it and start taking bookings and payments the same day.",
    tag: "Minutes",
  },
  {
    step: "04",
    icon: "🔄",
    title: "Change It Anytime",
    body: "Need a new field, a different workflow, a price change, staff logins? Describe it in plain English and your live app updates — no rebuild, no developer, no wait.",
    tag: "Anytime",
  },
];

const CATEGORIES = [
  {
    icon: "📅",
    title: "Booking & Scheduling",
    desc: "Let customers book appointments online, 24/7 — no phone calls needed.",
    for: "Salons · Clinics · Gyms · Studios",
    features: [
      "Public booking page",
      "Deposit & cancellation policies",
      "Card payments straight to your bank (Stripe)",
      "Staff logins for your team",
      "Calendar management",
    ],
  },
  {
    icon: "👥",
    title: "Customer CRM",
    desc: "Track every client, lead, and deal from one clean dashboard.",
    for: "Consultants · Coaches · Freelancers",
    features: [
      "Contact management",
      "Lead pipeline tracking",
      "Deal stage tracking",
      "Notes & activity history",
      "Owner dashboard with live metrics",
    ],
  },
  {
    icon: "📦",
    title: "Inventory & Orders",
    desc: "Know exactly what you have in stock and what needs reordering.",
    for: "Retailers · Cafes · Boutiques · Makers",
    features: [
      "Real-time stock tracking",
      "Order management",
      "Barcode & SKU lookup",
      "Supplier contacts",
      "Owner dashboard with live metrics",
    ],
  },
  {
    icon: "🔐",
    title: "Customer Portal",
    desc: "Give clients a secure place to check status, share files, and pay invoices.",
    for: "Law firms · Accountants · Agencies",
    features: [
      "Secure client login",
      "Document sharing",
      "Project status tracking",
      "Team logins & roles",
      "Invoice history",
    ],
  },
  {
    icon: "🧾",
    title: "Invoicing & Quotes",
    desc: "Send professional quotes, invoice clients, and get paid faster — no spreadsheets.",
    for: "Contractors · Electricians · Plumbers · Landscapers",
    features: [
      "Quote & estimate builder",
      "One-click invoicing",
      "Card payments straight to your bank (Stripe)",
      "Automatic payment reminders",
      "Job history tracking",
    ],
  },
  {
    icon: "🎫",
    title: "Membership Management",
    desc: "Manage recurring memberships, track check-ins, and automate billing.",
    for: "Gyms · Studios · Clubs · Wellness Centers",
    features: [
      "Recurring billing to your own Stripe account",
      "Member check-in tracking",
      "Plan tiers & pricing",
      "Staff check-in logins",
      "Attendance reporting",
    ],
  },
];

const WHY_VISION_WORKX = [
  {
    quote:
      "Most small business owners we talk to have wanted a custom app for years — but agencies quote $15,000+ and 3 months, and no-code tools still require you to be the builder. Vision Workx exists to close that gap.",
  },
  {
    quote:
      "You describe your business. We generate a working app — booking, scheduling, client management, whatever you need — and deploy it live. No dev team, no code, no waiting months.",
  },
  {
    quote:
      "We're a new platform, and we'd rather be upfront about that than fake a track record. What you get is a founder-built product, direct support, and a pricing model with no surprise bills — something even the big AI app builders haven't figured out yet.",
  },
];

const STATS = [
  { value: "~10 min", label: "From description to live app" },
  { value: "6 app types", label: "Combine as many as you need" },
  { value: "$0", label: "To preview before you sign up" },
];

const EVERY_APP = [
  {
    icon: "💳",
    title: "Card payments",
    body: "Take deposits, invoices, and memberships. Money goes straight to your own Stripe account — we never hold it.",
  },
  {
    icon: "📊",
    title: "Owner dashboard",
    body: "A live metrics view in every app — revenue, bookings, active members — so you see what's working.",
  },
  {
    icon: "👥",
    title: "Staff logins",
    body: "Invite your team with a link. Each person gets their own login; you control who sees what.",
  },
  {
    icon: "🌐",
    title: "Custom domain",
    body: "Launch on yourbusiness.com — set it up yourself from the dashboard, no support ticket.",
  },
  {
    icon: "⬇️",
    title: "Your data, exportable",
    body: "Export everything to CSV anytime. Your business, your data.",
  },
  {
    icon: "🔄",
    title: "Plain-English edits",
    body: "Change any screen, field, or rule by describing it. Your live app updates in place.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar />

      {/* ─── Brand strip ─── */}
      <section className="bg-navy-dark text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="flex items-center gap-2.5 hover:[text-shadow:0_0_10px_rgba(232,184,75,0.75)] transition-all"
              >
                <span className="bg-white rounded-lg p-1.5 flex items-center justify-center shrink-0">
                  <Image src="/VisionWorks.png" alt="Vision Workx" width={48} height={48} className="rounded-sm" />
                </span>
                <span className="text-xl font-bold tracking-tight text-promote-gold">Vision Workx</span>
              </Link>
              <a
                href="https://revalor-automation.vercel.app/"
                className="text-xs text-blue-300 hover:text-white hover:[text-shadow:0_0_10px_rgba(255,255,255,0.85)] transition-all"
              >
                by Revalor
              </a>
            </div>
            <Link
              href="/web-app-vs-web-page"
              className="text-sm font-medium text-blue-100 hover:text-white hover:[text-shadow:0_0_10px_rgba(255,255,255,0.85)] transition-all"
            >
              Web App vs. Web Page
            </Link>
            <Link
              href="/#contact"
              className="text-sm font-medium text-blue-100 hover:text-white hover:[text-shadow:0_0_10px_rgba(255,255,255,0.85)] transition-all"
            >
              Contact Us
            </Link>
          </div>
        </div>
      </section>

      {/* ─── Hero ─── */}
      <section className="relative bg-gradient-to-br from-navy-dark via-[#1e3f6b] to-[#0d1f35] text-white overflow-hidden">
        {/* subtle grid overlay */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        <div className="relative max-w-6xl mx-auto px-4 pt-8 pb-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left — CTA */}
            <div className="text-center lg:text-left">
              <span className="inline-flex items-center gap-2 text-xs font-semibold text-blue-300 bg-blue-900/40 border border-blue-700/50 px-4 py-2 rounded-full mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                Powered by Claude AI · No Code Required
              </span>

              <h1 className="text-5xl md:text-6xl font-bold leading-[1.1] tracking-tight">
                Describe it.
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-blue-300">
                  We build it.
                </span>
              </h1>

              <p className="mt-6 text-lg md:text-xl text-blue-100/80 leading-relaxed max-w-lg mx-auto lg:mx-0">
                Describe your business in plain English and get a working web app
                — bookings, card payments, customer records, staff logins —
                deployed live in minutes. Need a change later? Just ask for it.
                No developers, ever.
              </p>

              <div className="mt-8 flex flex-col items-center lg:items-start gap-4">
                <HeroEmailForm />
                <Link
                  href="/try"
                  className="text-sm font-medium text-blue-300 hover:text-white underline underline-offset-4 decoration-blue-500/50 hover:decoration-white transition-all"
                >
                  or see a real app built for a business like yours first →
                </Link>
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-4 gap-y-1 text-xs text-blue-300/80">
                  <span className="flex items-center gap-1">
                    <span className="text-green-400">✓</span> Preview a real app before you sign up
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="text-green-400">✓</span> No card for the preview
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="text-green-400">✓</span> Cancel anytime
                  </span>
                </div>
              </div>
            </div>

            {/* Right — Browser mockup */}
            <div className="hidden lg:block">
              <div className="rounded-2xl border border-promote-gold bg-blue-950/60 overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-sm">
                {/* Browser chrome */}
                <div className="flex items-center gap-2 px-4 py-3 bg-blue-900/70 border-b border-blue-700/50">
                  <span className="w-3 h-3 rounded-full bg-red-400/80" />
                  <span className="w-3 h-3 rounded-full bg-yellow-400/80" />
                  <span className="w-3 h-3 rounded-full bg-green-400/80" />
                  <div className="ml-3 flex-1 bg-blue-900/80 rounded-md px-3 py-1 text-xs text-blue-300 font-mono">
                    app.visionworkx.com/onboard
                  </div>
                </div>
                {/* Mockup content */}
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-2 mb-5">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <div
                          key={n}
                          className={`h-1.5 rounded-full ${
                            n <= 1
                              ? "w-8 bg-blue-400"
                              : "w-4 bg-blue-800"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-blue-400 ml-auto border border-promote-gold rounded-full px-2.5 py-1">
                      Step 1 of 5
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-blue-300 uppercase tracking-wider">
                    Tell us about your business
                  </p>
                  <div className="space-y-2.5">
                    {[
                      ["Business Name", "Radiance Hair Studio"],
                      ["Location", "Austin, TX"],
                      ["App Category", "Booking & Scheduling ✓"],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="bg-blue-900/50 border border-blue-700/50 rounded-xl px-4 py-3 text-sm"
                      >
                        <span className="text-blue-400 text-xs">{label}: </span>
                        <span className="text-white font-medium">{value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="pt-1">
                    <div className="bg-navy text-white text-sm font-semibold px-5 py-2.5 rounded-xl inline-flex items-center gap-2">
                      Next: Choose Features
                      <span className="text-blue-300">→</span>
                    </div>
                  </div>
                  <div className="border-t border-blue-800 pt-3 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-xs text-blue-400">
                      AI is ready to build your app
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats bar */}
          <div className="mt-14 grid grid-cols-3 divide-x divide-blue-800 border-t border-blue-800 pt-8">
            {STATS.map(({ value, label }) => (
              <div key={label} className="text-center px-4">
                <p className="text-2xl md:text-3xl font-bold text-white">
                  {value}
                </p>
                <p className="text-xs text-blue-400 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Problem ─── */}
      <section className="py-20 px-4 bg-off-white">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-navy-dark">
            Most small businesses waste time on manual tasks.
          </h2>
          <ul className="mt-8 flex flex-wrap justify-center gap-3">
            {[
              "Booking and scheduling",
              "Customer follow-ups",
              "Invoicing and quotes",
              "CRM and customer management",
              "Membership and portal access",
            ].map((item) => (
              <li
                key={item}
                className="text-sm font-medium text-navy bg-white border border-gray-200 px-4 py-2 rounded-full"
              >
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-8 text-gray-600 text-lg">
            Vision Workx builds the app your business needs in minutes —
            payments, scheduling, customers, and team access in one place — and
            keeps changing it as you grow.
          </p>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section id="how-it-works" className="py-24 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-navy uppercase tracking-widest mb-3">
              How It Works
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-dark">
              From idea to live app in minutes
            </h2>
            <p className="mt-3 text-gray-500 text-lg">
              Four steps. No technical skills required.
            </p>
          </div>

          <div className="relative grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
            {/* Connector line (desktop only) */}
            <div
              aria-hidden
              className="hidden md:block absolute top-12 left-[calc(12.5%+28px)] right-[calc(12.5%+28px)] h-px border-t-2 border-dashed border-gray-200"
            />

            {HOW_IT_WORKS.map((item) => (
              <div key={item.step} className="relative text-center group">
                <div className="w-16 h-16 rounded-2xl bg-navy-dark text-white flex items-center justify-center mx-auto mb-6 shadow-lg group-hover:scale-105 transition-transform">
                  <span className="text-2xl">{item.icon}</span>
                </div>
                <span className="text-xs font-bold text-navy/40 tracking-widest uppercase mb-2 block">
                  Step {item.step}
                </span>
                <h3 className="text-xl font-bold text-navy-dark mb-3">
                  {item.title}
                </h3>
                <p className="text-gray-500 leading-relaxed text-sm mb-4">
                  {item.body}
                </p>
                <span className="inline-block text-xs font-semibold text-navy bg-blue-50 px-3 py-1 rounded-full">
                  {item.tag}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── App Categories ─── */}
      <section id="categories" className="py-24 px-4 bg-off-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-navy uppercase tracking-widest mb-3">
              App Types
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-dark">
              Built for your type of business
            </h2>
            <p className="mt-3 text-gray-500 text-lg">
              Pick your main type — then add any others you need. A gym can be
              booking + memberships + CRM in one app.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {CATEGORIES.map((cat) => (
              <div
                key={cat.title}
                className="bg-white border border-gray-200 rounded-2xl p-7 hover:border-navy hover:shadow-lg transition-all group"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-2xl shrink-0 group-hover:bg-blue-100 transition-colors">
                    {cat.icon}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-navy-dark leading-tight">
                      {cat.title}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">{cat.desc}</p>
                  </div>
                </div>

                <ul className="space-y-2 mb-5">
                  {cat.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2 text-sm text-gray-600"
                    >
                      <span className="text-navy shrink-0">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-navy bg-blue-50 px-3 py-1.5 rounded-full">
                    {cat.for}
                  </p>
                  <Link
                    href="/signup"
                    className="text-xs font-semibold text-navy hover:underline"
                  >
                    Get this app →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Examples ─── */}
      <section className="py-24 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-navy uppercase tracking-widest mb-3">
              Real Results
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-dark">
              See what gets built
            </h2>
            <p className="mt-3 text-gray-500 text-lg">
              Sample apps generated by Vision Workx — click through and explore.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            {EXAMPLES.map((ex) => (
              <a
                key={ex.name}
                href={ex.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block bg-white border border-gray-200 rounded-2xl overflow-hidden hover:border-navy hover:shadow-lg transition-all"
              >
                <div className="relative">
                  <Image
                    src={ex.image}
                    alt={ex.name}
                    width={1280}
                    height={720}
                    className="w-full h-auto border-b border-gray-200"
                  />
                  <span className="absolute top-3 left-3 text-[11px] font-semibold uppercase tracking-wide bg-navy-dark/90 text-white px-2.5 py-1 rounded-full">
                    Sample app
                  </span>
                </div>
                <div className="p-5 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-navy-dark">{ex.name}</p>
                    <p className="text-sm text-gray-500">{ex.category}</p>
                  </div>
                  <span className="text-sm font-semibold text-navy group-hover:underline shrink-0">
                    View live →
                  </span>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Everything included ─── */}
      <section className="py-24 px-4 bg-off-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-navy uppercase tracking-widest mb-3">
              ✅ In every app, no add-ons
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-dark">
              What every Vision Workx app comes with
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {EVERY_APP.map((item) => (
              <div
                key={item.title}
                className="bg-white border border-gray-200 rounded-2xl p-7 hover:border-navy hover:shadow-lg transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-2xl shrink-0 mb-4">
                  {item.icon}
                </div>
                <h3 className="text-lg font-bold text-navy-dark leading-tight mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── VisionWorkx Automation ─── */}
      <section className="py-20 px-4 bg-navy-dark text-white">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-semibold text-promote-gold uppercase tracking-widest mb-3">
            ⚡ Included With Every App
          </p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            <span className="text-promote-gold">VisionWorkx Automation</span> comes built in
          </h2>
          <p className="text-blue-100 text-lg leading-relaxed max-w-2xl mx-auto">
            Every app ships with automation already running — and the automations
            match the kind of app you built: booking confirmations,
            membership-renewal notices, invoice reminders, review requests. No
            setup, no add-on purchase. Turn any of them on or off from your
            dashboard.
          </p>

          <div className="mt-10 grid grid-cols-3 gap-4 max-w-lg mx-auto">
            {[
              { tier: "Starter", count: "100" },
              { tier: "Growth", count: "500" },
              { tier: "Pro", count: "2,000" },
            ].map((t) => (
              <div key={t.tier} className="bg-white/5 border border-blue-800 rounded-xl p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-blue-300 mb-1">
                  {t.tier}
                </div>
                <div className="text-2xl font-bold text-promote-gold">{t.count}</div>
                <div className="text-xs text-blue-300">emails / mo</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing ─── */}
      <PricingSection />

      {/* ─── Why Vision Workx Exists ─── */}
      <section id="why-choose-us" className="py-24 px-4 bg-white">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-sm font-semibold text-navy uppercase tracking-widest mb-3">
            ⚙️ Why Vision Workx Exists
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-navy-dark mb-6">
            Built to give you your time back
          </h2>
          <p className="text-gray-600 text-lg leading-relaxed">
            Small businesses run on passion — but that passion gets buried
            under endless admin, scattered tools, and tech that slows
            everything down. Owners waste hours managing bookings, payments,
            customers, and workflows that never quite fit together. Vision
            Workx fixes that by turning your entire process into a simple,
            automated app built instantly by AI. No coding, no developers, no
            delays. Just clarity, control, and more time to grow your
            business.
          </p>
        </div>
      </section>

      {/* ─── Why Choose Vision Workx ─── */}
      <section className="pt-6 pb-24 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-navy uppercase tracking-widest mb-3">
              Why Choose Vision Workx
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-navy-dark">
              Built for business owners, not developers
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {WHY_VISION_WORKX.map((item, i) => (
              <div
                key={i}
                className="bg-off-white border border-gray-100 rounded-2xl p-7 flex flex-col hover:shadow-md transition-shadow"
              >
                <p className="text-gray-700 text-sm leading-relaxed flex-1">
                  &ldquo;{item.quote}&rdquo;
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="py-24 px-4 bg-gradient-to-br from-navy-dark via-[#1e3f6b] to-[#0d1f35] text-white">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Your app could be live this week.
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
              href="#how-it-works"
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
