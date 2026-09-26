import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/modules/ownerApi";
import { modulesServiceClient } from "@/lib/modules/supabase";
import { formFromPrompt } from "@/lib/modules/formFromPrompt";
import { currentPeriod, limitsFor } from "@/lib/modules/plans";

// "Describe your form" -> an editable draft. Nothing is saved here.
export const runtime = "nodejs";

export async function POST(req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const auth = await requireOwner(slug);
  if ("error" in auth) return auth.error;

  let body: { description?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (description.length < 8) return NextResponse.json({ error: "Describe the form in a sentence or two." }, { status: 400 });
  if (description.length > 800) return NextResponse.json({ error: "Keep the description under 800 characters." }, { status: 400 });

  const db = modulesServiceClient();
  const { data: monthly } = await db.rpc("vw_rate_check", {
    p_key: `ai_month:${auth.workspace.id}:${currentPeriod()}`,
    max_hits: limitsFor(auth.workspace.plan).aiDraftsPerMonth,
    window_seconds: 32 * 86400,
  });
  if (monthly === false) {
    return NextResponse.json({ error: "You've used this month's AI drafts for your plan. You can still build and edit forms by hand, or upgrade on the Billing page." }, { status: 429 });
  }
  const { data: allowed } = await db.rpc("vw_rate_check", {
    p_key: `ai_draft:${auth.workspace.id}`,
    max_hits: 20,
    window_seconds: 3600,
  });
  if (allowed === false) {
    return NextResponse.json({ error: "You've drafted a lot of forms this hour — try again a bit later, or edit the current draft by hand." }, { status: 429 });
  }

  const { config, fromAi } = await formFromPrompt({ description, businessName: auth.workspace.name });
  return NextResponse.json({
    config,
    fromAi,
    note: fromAi ? null : "We couldn't draft that automatically, so here's a standard form to start from.",
  });
}
