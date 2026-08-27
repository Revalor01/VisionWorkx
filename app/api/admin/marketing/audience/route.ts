import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/social/adminAuth";
import { getAudienceCount } from "@/lib/marketing/audience";
import { MARKETING_PRODUCT_SLUGS } from "@/lib/marketing/products";
import type { MarketingProduct } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const product = req.nextUrl.searchParams.get("product") as MarketingProduct | null;
  if (!product || !MARKETING_PRODUCT_SLUGS.includes(product)) {
    return NextResponse.json({ error: "Invalid or missing product" }, { status: 400 });
  }

  try {
    const count = await getAudienceCount(product);
    return NextResponse.json({ product, count });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
