import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/modules/ownerApi";
import { modulesServiceClient } from "@/lib/modules/supabase";
import { buildStoredConfig, CREATABLE_TYPES } from "@/lib/modules/moduleConfig";
import { limitsFor, PLAN_PRICE, type ModulePlan } from "@/lib/modules/plans";

// Owners create a new module (lead-capture form or quote calculator), saved as a draft. Module inserts
// are server-only by design (RLS), so this route checks ownership, then
// writes with the service role after sanitising the config.
export async function POST(req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const auth = await requireOwner(slug);
  if ("error" in auth) return auth.error;
  let body: { name?: unknown; config?: unknown; type?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const type = body.type === undefined ? "lead_capture" : body.type;
  if (!(CREATABLE_TYPES as readonly unknown[]).includes(type)) return NextResponse.json({ error: "Unknown module type." }, { status: 400 });
  const built = buildStoredConfig(type as string, body.config, auth.workspace.time_zone);
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });
  const config = built.config;
  const fallbackName =
    type === "quote_calculator" ? "Quote calculator" : type === "booking" ? "Online booking" : type === "receptionist" ? "AI receptionist" : "Lead capture form";
  const name = (typeof body.name === "string" && body.name.trim() ? body.name.trim() : config.title || fallbackName).slice(0, 120);

  const db = modulesServiceClient();
  const { count } = await db.from("vw_modules").select("id", { count: "exact", head: true }).eq("workspace_id", auth.workspace.id);
  const cap = limitsFor(auth.workspace.plan).modules;
  if ((count ?? 0) >= cap) {
    const label = PLAN_PRICE[auth.workspace.plan as ModulePlan]?.label ?? auth.workspace.plan;
    return NextResponse.json({ error: `Your ${label} plan includes ${cap} module${cap === 1 ? "" : "s"}. Upgrade on the Billing page to add more.` }, { status: 402 });
  }

  const { data, error } = await db
    .from("vw_modules")
    .insert({ workspace_id: auth.workspace.id, type, name, config, status: "draft" })
    .select("id, public_id")
    .single();
  if (error || !data) return NextResponse.json({ error: "Couldn't save the form." }, { status: 500 });
  // Booking pages get booking-worded emails (the defaults talk about a "request").
  // Module-level templates, so the owner can still edit them on the Emails page.
  if (type === "booking") {
    const { error: tplErr } = await db.from("vw_email_templates").insert([
      {
        workspace_id: auth.workspace.id,
        module_id: data.id,
        kind: "customer_confirmation",
        subject: "You're booked with {{business_name}}, {{customer_first_name}}",
        body:
          "Hi {{customer_first_name}},\n\nYou're booked! Here are the details:\n\n{{submission_summary}}\n\n" +
          "We'll send you a reminder the day before. Need to change it? Use the change or cancel link above.\n\n— {{business_name}}",
      },
      {
        workspace_id: auth.workspace.id,
        module_id: data.id,
        kind: "owner_alert",
        subject: "New booking: {{customer_name}}",
        body: "You have a new booking from your {{form_name}} page.\n\n{{submission_summary}}\n\nSee all bookings: {{dashboard_url}}/bookings",
      },
    ]);
    if (tplErr) console.error("[modules] booking email templates failed:", tplErr.message);
  }
  return NextResponse.json({ ok: true, publicId: data.public_id });
}
