import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createServerClient } from "@/lib/supabase";

const ADMIN_EMAIL = "sawilliams721@gmail.com";

export interface PaymentRow {
  id: string;
  stripeInvoiceId: string;
  customerEmail: string;
  customerName: string | null;
  amount: number;       // cents
  currency: string;
  status: "paid" | "open" | "void" | "uncollectible" | "draft";
  plan: string | null;
  created: number;      // unix timestamp
  hostedUrl: string | null;
  pdfUrl: string | null;
  attemptCount: number;
  nextPaymentAttempt: number | null;
}

export async function GET() {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-06-24.dahlia",
  });

  // Fetch up to 100 most recent invoices, expanding customer
  const invoices = await stripe.invoices.list({
    limit: 100,
    expand: ["data.customer"],
  });

  const rows: PaymentRow[] = invoices.data.map((inv) => {
    const customer = inv.customer as Stripe.Customer | null;

    // Map price ID to plan name — SDK v22 uses pricing.price_details
    let plan: string | null = null;
    const lineItem = inv.lines?.data?.[0];
    const priceId =
      (lineItem?.pricing as { price_details?: { price: string } } | null)
        ?.price_details?.price ?? "";
    if (priceId === process.env.STRIPE_STARTER_PRICE_ID) plan = "Starter";
    else if (priceId === process.env.STRIPE_GROWTH_PRICE_ID) plan = "Growth";
    else if (priceId === process.env.STRIPE_PRO_PRICE_ID) plan = "Pro";

    return {
      id: inv.id,
      stripeInvoiceId: inv.id,
      customerEmail: customer?.email ?? inv.customer_email ?? "Unknown",
      customerName: customer?.name ?? null,
      amount: inv.amount_paid || inv.amount_due,
      currency: inv.currency,
      status: inv.status as PaymentRow["status"],
      plan,
      created: inv.created,
      hostedUrl: inv.hosted_invoice_url ?? null,
      pdfUrl: inv.invoice_pdf ?? null,
      attemptCount: inv.attempt_count,
      nextPaymentAttempt: inv.next_payment_attempt ?? null,
    };
  });

  // Summary stats
  const totalRevenue = rows
    .filter((r) => r.status === "paid")
    .reduce((sum, r) => sum + r.amount, 0);

  const failedCount = rows.filter(
    (r) => r.status === "open" && r.attemptCount > 0
  ).length;

  return NextResponse.json({ rows, totalRevenue, failedCount });
}
