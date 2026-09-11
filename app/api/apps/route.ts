import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import type { AppCategory, IntakeData } from "@/lib/database.types";
import { tenantCustomerRowCounts } from "@/lib/apps/tenantSchema";

const VALID_CATEGORIES: readonly AppCategory[] = [
  "booking",
  "crm",
  "inventory",
  "portal",
  "invoicing",
  "membership",
  "storefront",
];

const CATEGORY_LABEL: Record<string, string> = {
  booking: "Booking App",
  crm: "CRM",
  inventory: "Inventory App",
  portal: "Customer Portal",
  invoicing: "Invoicing App",
  membership: "Membership App",
  storefront: "Online Store",
};

// Add-on categories, deduped, primary removed, capped at 2. Past two, the
// generation runs longer than the function limit and the build times out.
const MAX_SECONDARY = 2;
function capSecondary(intake: IntakeData) {
  return [...new Set(intake.secondaryCategories ?? [])]
    .filter((c) => c !== intake.category)
    .slice(0, MAX_SECONDARY);
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let intake: IntakeData;
  try {
    intake = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!VALID_CATEGORIES.includes(intake.category as AppCategory)) {
    return NextResponse.json({ error: `Unknown category: ${intake.category}` }, { status: 400 });
  }
  // Cap add-on categories at 2 — more than that and generation runs past
  // the function time limit and the build times out.
  intake.secondaryCategories = capSecondary(intake);

  const appName = `${intake.businessName} ${CATEGORY_LABEL[intake.category] ?? intake.category}`;

  const serviceClient = createServiceClient();
  const { data: app, error: insertError } = await serviceClient
    .from("apps")
    .insert({
      user_id: user.id,
      name: appName,
      category: intake.category,
      secondary_categories: intake.secondaryCategories ?? [],
      status: "generating",
      intake_data: intake,
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("[api/apps] insert error:", insertError.message);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ appId: app.id }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    appId?: string;
    intake?: IntakeData;
    changeCategory?: boolean;
    discardData?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const appId = body.appId ?? "";
  const intake = body.intake;
  if (!appId || !intake) {
    return NextResponse.json({ error: "Missing appId or intake" }, { status: 400 });
  }

  const serviceClient = createServiceClient();

  // Ownership check — only the owner can edit their app. Pull the stored
  // category so an edit can't silently change it.
  const { data: existing } = await serviceClient
    .from("apps")
    .select("id, user_id, category, secondary_categories")
    .eq("id", appId)
    .single();

  if (!existing || existing.user_id !== user.id) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  // T0.3 — regeneration re-runs a fresh AI migration against the app's
  // existing tenant schema; a drifted or dropped table loses real records.
  // Until the non-destructive rebuild path (T1) exists, refuse to regenerate
  // an app that holds customer data unless the caller explicitly accepts the
  // loss (discardData:true). (docs/stabilization-plan.md T0.3)
  if (body.discardData !== true) {
    const dataRows = await tenantCustomerRowCounts(appId);
    if (dataRows.length > 0) {
      return NextResponse.json(
        {
          error:
            "This app has customer data. Regenerating it now could lose those records — that safe path isn't built yet.",
          code: "has_customer_data",
          detail: dataRows.map((r) => `${r.table}: ${r.rows}`).join(", "),
        },
        { status: 409 },
      );
    }
  }

  // An app's category is FIXED unless the caller explicitly asks to change it
  // (changeCategory:true). The intake form falls through to its "booking"
  // default when the category step isn't re-touched on an edit — that has
  // silently rebuilt a storefront as a booking app. Pin it back, and keep the
  // intake JSON consistent so downstream (generate prompt, validate) agrees.
  // (docs/stabilization-plan.md T0.2)
  if (body.changeCategory === true) {
    if (!VALID_CATEGORIES.includes(intake.category as AppCategory)) {
      return NextResponse.json({ error: `Unknown category: ${intake.category}` }, { status: 400 });
    }
  } else {
    if (intake.category !== existing.category) {
      console.warn(
        `[api/apps] PATCH ${appId}: ignoring category change ${existing.category} -> ${intake.category} (no changeCategory flag)`,
      );
    }
    intake.category = existing.category as IntakeData["category"];
    intake.secondaryCategories = (existing.secondary_categories ?? []) as IntakeData["secondaryCategories"];
  }
  intake.secondaryCategories = capSecondary(intake);

  const appName = `${intake.businessName} ${CATEGORY_LABEL[intake.category] ?? intake.category}`;

  const { error: updateError } = await serviceClient
    .from("apps")
    .update({
      name: appName,
      category: intake.category,
      secondary_categories: intake.secondaryCategories ?? [],
      intake_data: intake,
      status: "generating",
      // generated_code / deploy_url are NOT nulled here. The regeneration
      // stages into pending_generated_code and only a successful deploy
      // promotes it (T0.1); the live app stays reachable meanwhile.
    })
    .eq("id", appId);

  if (updateError) {
    console.error("[api/apps] update error:", updateError.message);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ appId }, { status: 200 });
}
