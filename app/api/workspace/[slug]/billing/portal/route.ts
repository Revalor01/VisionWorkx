import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/modules/ownerApi";
import { modulesServiceClient } from "@/lib/modules/supabase";
import { stripe } from "@/lib/modules/billing";

// Owners manage their plan, card and invoices in Stripe's customer portal.
export async function POST(req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const auth = await requireOwner(slug);
  if ("error" in auth) return auth.error;
  const { data: ws } = await modulesServiceClient().from("vw_workspaces").select("stripe_customer_id").eq("id", auth.workspace.id).single();
  if (!ws?.stripe_customer_id) return NextResponse.json({ error: "No billing account yet — start your trial first." }, { status: 400 });
  const session = await stripe().billingPortal.sessions.create({
    customer: ws.stripe_customer_id,
    return_url: `${req.nextUrl.origin}/workspace/${slug}/billing`,
  });
  return NextResponse.json({ url: session.url });
}
