import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Persistent "your Guided Build Session" screen, linked from the
// confirmation email so a customer can pick it up on any device — the
// email link works on the phone they booked on, or on a computer where
// they just log in and land here.
export default async function GuidedBookedPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/guided/booked");

  const { data: request } = await supabase
    .from("guided_session_requests")
    .select("business_name, business_type, description, status, paid_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const biz = request?.business_name || request?.business_type || "your business";

  let heading: string;
  let body: string;
  let cta: { href: string; label: string } | null = { href: "/dashboard", label: "Go to your dashboard →" };

  if (!request) {
    heading = "No session yet";
    body = "You don't have a Guided Build Session booked.";
    cta = { href: "/guided", label: "Book a session →" };
  } else if (!request.paid_at) {
    heading = "Almost there";
    body = "Your account is created, but checkout wasn't completed. Finish it to book your session.";
    cta = { href: "/guided", label: "Finish checkout →" };
  } else if (request.status === "delivered") {
    heading = "Your build is ready";
    body = `We've sent the build brief and a live preview for ${biz} to your email (check your spam or junk folder if it's not in your inbox). Open your dashboard to see the app.`;
  } else {
    heading = "You're booked in";
    body = `Payment received. We're working out exactly what ${biz} needs and will email your build brief and a live preview to ${user.email} — check your spam or junk folder if you don't see it. You can safely close this — nothing else to do right now.`;
  }

  return (
    <div className="min-h-screen bg-off-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <Link href="/" className="text-2xl font-bold text-navy-dark">
          Vision Workx
        </Link>
        <div className="text-5xl mt-8 mb-4">{request?.paid_at ? "✅" : "🕓"}</div>
        <h1 className="text-2xl font-bold text-navy-dark mb-3">{heading}</h1>
        <p className="text-gray-600 text-sm leading-relaxed mb-6">{body}</p>
        {request?.paid_at && (
          <p className="text-xs text-gray-400 mb-6">
            Your $10 is credited to your first month if you subscribe.
          </p>
        )}
        {cta && (
          <Link
            href={cta.href}
            className="inline-block bg-navy-dark text-white font-semibold px-6 py-3 rounded-xl hover:bg-navy transition-colors"
          >
            {cta.label}
          </Link>
        )}
      </div>
    </div>
  );
}
