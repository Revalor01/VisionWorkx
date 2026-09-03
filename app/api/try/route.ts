import { after, NextRequest, NextResponse } from "next/server";
import { createPreviewApp, runPreviewGenerate } from "@/lib/apps/preview";
import type { AppCategory, IntakeData } from "@/lib/database.types";

export const runtime = "nodejs";
// The response returns a token in ~1s, but `after()` keeps this function
// alive to drive the (non-streaming) preview generation to completion.
export const maxDuration = 800;

const CATEGORIES: AppCategory[] = [
  "booking",
  "crm",
  "inventory",
  "portal",
  "invoicing",
  "membership",
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST { email, intake } — create a no-account preview app and start
// generating it. Returns a token for the /try/[token] status page.
export async function POST(req: NextRequest) {
  let body: { email?: string; intake?: Partial<IntakeData> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const i = body.intake ?? {};
  if (!i.businessName?.trim() || !i.businessType?.trim()) {
    return NextResponse.json({ error: "Tell us your business name and type." }, { status: 400 });
  }
  if (!i.category || !CATEGORIES.includes(i.category)) {
    return NextResponse.json({ error: "Pick an app type." }, { status: 400 });
  }

  const intake: IntakeData = {
    businessName: i.businessName.trim().slice(0, 120),
    businessType: i.businessType.trim().slice(0, 120),
    location: (i.location ?? "").trim().slice(0, 160),
    description: (i.description ?? "").trim().slice(0, 600) || undefined,
    category: i.category,
    secondaryCategories: Array.isArray(i.secondaryCategories)
      ? (i.secondaryCategories.filter(
          (c): c is AppCategory => CATEGORIES.includes(c as AppCategory) && c !== i.category,
        ).slice(0, 3))
      : [],
    features: Array.isArray(i.features) ? i.features.slice(0, 20).map(String) : [],
    primaryColor: /^#[0-9a-f]{6}$/i.test(i.primaryColor ?? "") ? i.primaryColor! : "#1A3A5C",
    backgroundColor: /^#[0-9a-f]{6}$/i.test(i.backgroundColor ?? "")
      ? i.backgroundColor
      : "#F8FAFC",
    font: (i.font ?? "Inter").trim().slice(0, 40) || "Inter",
  };

  try {
    const { id, token, resumed } = await createPreviewApp(email, intake);
    if (!resumed) {
      // Runs after the response is sent; `after()` prevents the function
      // from freezing mid-generation.
      after(() => runPreviewGenerate(id));
    }
    return NextResponse.json({ token, resumed }, { status: resumed ? 200 : 201 });
  } catch (err) {
    console.error("[api/try] create failed:", err);
    return NextResponse.json(
      { error: "Couldn't start your preview. Try again in a minute." },
      { status: 500 },
    );
  }
}
