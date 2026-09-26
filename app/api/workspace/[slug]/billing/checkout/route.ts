import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/modules/ownerApi";
import { modulesServiceClient } from "@/lib/modules/supabase";
import { PLANS, type ModulePlan } from "@/lib/modules/plans";
import { priceIdFor, stripe, trialDaysForNewSubscription, type Interval } from "@/lib/modules/billing";

// Owners start a subscription (first one gets the 14-day trial). Prices are
// looked up server-side — the client only picks a plan and interval.
export async function POST(req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const auth = await requireOwner(slug);
  if ("error" in auth) return auth.error;
  let b: { plan?: unknown; interval?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const plan = (PLANS as readonly string[]).includes(b.plan as string) ? (b.plan as ModulePlan) : null;
  const interval: Interval = b.interval === "annual" ? "annual" : "monthly";
  if (!plan) return NextResponse.json({ error: "Choose a plan." }, { status: 400 });
  const price = priceIdFor(plan, interval);
  if (!price) return NextResponse.json({ error: "Billing isn't configured yet." }, { status: 503 });

  const db = modulesServiceClient();
  const { data: ws } = await db
    .from("vw_workspaces")
    .select("id, name, notification_email, stripe_customer_id, stripe_subscription_id, billing_status")
    .eq("id", auth.workspace.id)
    .single();
  if (!ws) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ws.billing_status === "comped") return NextResponse.json({ error: "This workspace is covered by Revalor — no billing needed." }, { status: 400 });
  if (["trialing", "active", "past_due"].includes(ws.billing_status)) {
    return NextResponse.json({ error: "You already have a plan — use Manage billing to change it." }, { status: 409 });
  }

  const s = stripe();
  let customer = ws.stripe_customer_id as string | null;
  if (!customer) {
    const c = await s.customers.create({
      name: ws.name,
      email: auth.user.email ?? ws.notification_email ?? undefined,
      metadata: { vw_workspace_id: ws.id },
    });
    customer = c.id;
    await db.from("vw_workspaces").update({ stripe_customer_id: customer }).eq("id", ws.id);
  }

  const trialDays = trialDaysForNewSubscription(ws);
  const base = req.nextUrl.origin;
  // First-time setup: land on the form builder (next checklist step) after checkout.
  const { count: moduleCount } = await db.from("vw_modules").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id);
  const successUrl = moduleCount ? `${base}/workspace/${slug}/billing?checkout=success` : `${base}/workspace/${slug}/modules/new?checkout=success`;
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer,
    line_items: [{ price, quantity: 1 }],
    payment_method_collection: "always",
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { vw_workspace_id: ws.id },
      ...(trialDays ? { trial_period_days: trialDays } : {}),
    },
    metadata: { vw_workspace_id: ws.id },
    success_url: successUrl,
    cancel_url: `${base}/workspace/${slug}/billing?checkout=cancelled`,
  });
  return NextResponse.json({ url: session.url });
}
