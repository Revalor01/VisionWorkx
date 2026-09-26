import Link from "next/link";
import { WAITLIST_URL } from "@/lib/featureFlags";

// Shown in place of the app builder while full-app generation is frozen
// (lib/featureFlags.ts). Server component: no client JS.
export default function GenerationPaused({ backHref = "/dashboard" }: { backHref?: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-16">
      <div className="max-w-lg w-full bg-white border border-gray-200 rounded-2xl p-8 text-center shadow-sm">
        <div className="text-5xl mb-4" aria-hidden="true">🧩</div>
        <h1 className="text-2xl font-bold text-navy-dark mb-3">New app builds are paused</h1>
        <p className="text-gray-600 leading-relaxed mb-6">
          VisionWorkx is becoming a set of ready-made modules (lead capture, online booking, quote
          calculators, intake forms and a dashboard) that install on the website you already have,
          with automatic follow-up emails included. We&apos;re not starting new full-app builds while
          we make the switch.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href={WAITLIST_URL}
            className="inline-block bg-navy-dark text-white font-semibold px-6 py-3 rounded-xl hover:bg-navy transition-colors"
          >
            Try VisionWorkx modules free →
          </a>
          <Link
            href={backHref}
            className="inline-block border border-gray-200 text-gray-700 font-semibold px-6 py-3 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Back
          </Link>
        </div>
      </div>
    </main>
  );
}
