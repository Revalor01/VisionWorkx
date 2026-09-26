import type { Metadata } from "next";
import Link from "next/link";
import StartForm from "./StartForm";
import { selfServeEnabled, SITE_BUILDERS } from "@/lib/modules/selfServe";
import { PLAN_LIMITS, PLAN_PRICE, TRIAL_DAYS } from "@/lib/modules/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Start your free trial — VisionWorkx",
  description: `Add lead capture, quote requests and automatic follow-up to the website you already have. ${TRIAL_DAYS}-day free trial.`,
};

const WAITLIST = "https://products.revalorllc.com/visionworkx/waitlist";

export default function StartPage() {
  const open = selfServeEnabled();
  const starter = PLAN_PRICE.starter;
  const limits = PLAN_LIMITS.starter;
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12 md:py-16">
      <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-[1fr_1.1fr] md:items-start">
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">VisionWorkx</p>
          <h1 className="mt-2 text-3xl font-bold text-navy-dark text-balance md:text-4xl">
            Give your website a front desk in about ten minutes.
          </h1>
          <p className="mt-4 text-gray-600">
            Describe the form you need in a sentence, match it to your brand, and paste one line into WordPress, Squarespace, Wix,
            Webflow, Framer or Shopify. Every request lands in one dashboard, and customers get an instant reply.
          </p>
          <ol className="mt-6 space-y-3 text-sm text-gray-700">
            <li><strong className="text-navy-dark">1. Create your workspace</strong> — takes a minute.</li>
            <li><strong className="text-navy-dark">2. Start your {TRIAL_DAYS}-day free trial</strong> — card required, cancel any time before it ends and you won&apos;t be charged.</li>
            <li><strong className="text-navy-dark">3. Build your first form and put it on your site</strong> — or have us install it for you.</li>
          </ol>
          <p className="mt-6 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600">
            Starter is <strong>${starter.monthly}/month</strong> after the trial: {limits.modules} modules,{" "}
            {limits.submissionsPerMonth.toLocaleString()} submissions and {limits.emailsPerMonth.toLocaleString()} automatic emails a
            month. <Link href="/#pricing" className="font-semibold text-navy hover:underline">Compare plans</Link>
          </p>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
          {open ? (
            <>
              <h2 className="text-xl font-bold text-navy-dark">Create your workspace</h2>
              <p className="mt-1 mb-6 text-sm text-gray-600">No password — we&apos;ll email you a secure sign-in link.</p>
              <StartForm builders={[...SITE_BUILDERS]} />
              <p className="mt-6 text-center text-sm text-gray-500">
                Already have a workspace? <Link href="/workspace/login" className="font-semibold text-navy hover:underline">Sign in</Link>
              </p>
            </>
          ) : (
            <div className="text-center">
              <h2 className="text-xl font-bold text-navy-dark">Self-serve signup is coming soon</h2>
              <p className="mt-2 text-gray-600">Join the waitlist and we&apos;ll email you the day it opens.</p>
              <a href={WAITLIST} className="mt-6 inline-block rounded-xl bg-navy-dark px-6 py-3 font-semibold text-white hover:bg-navy">
                Join the waitlist →
              </a>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
