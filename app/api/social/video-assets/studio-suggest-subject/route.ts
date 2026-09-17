import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { isAdminOrEditor } from "@/lib/social/authGuard";
import { generateStudioSubject } from "@/lib/social/studioSubjectGenerator";
import type { SocialVideoProduct } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 30;

const PRODUCTS: SocialVideoProduct[] = [
  "visionworkx", "proactive", "revalor_consulting", "chorebit", "feelflow", "mindbit", "sanctum", "revalor",
];

// Fast, cheap text-only call (unlike studio-generate's video job) — no
// background job needed, just await and return.
export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!(await isAdminOrEditor(user))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const product: string | undefined = body?.product;
  if (!product || !(PRODUCTS as string[]).includes(product)) {
    return NextResponse.json({ error: `product must be one of: ${PRODUCTS.join(", ")}` }, { status: 400 });
  }

  try {
    const subject = await generateStudioSubject(product as SocialVideoProduct);
    return NextResponse.json({ subject });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
