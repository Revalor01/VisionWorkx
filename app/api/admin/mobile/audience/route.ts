import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/social/adminAuth";
import { getPushAudience, getSmsAudience, filterSmsOptOuts } from "@/lib/mobile/audience";
import { MARKETING_PRODUCT_SLUGS } from "@/lib/marketing/products";
import type { MarketingProduct } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const product = req.nextUrl.searchParams.get("product") as MarketingProduct | null;
  const channel = req.nextUrl.searchParams.get("channel");
  if (!product || !MARKETING_PRODUCT_SLUGS.includes(product)) {
    return NextResponse.json({ error: "Invalid or missing product" }, { status: 400 });
  }
  if (channel !== "push" && channel !== "sms") {
    return NextResponse.json({ error: "channel must be push or sms" }, { status: 400 });
  }

  try {
    if (channel === "push") {
      const audience = await getPushAudience(product);
      return NextResponse.json({ product, channel, count: audience.length });
    }
    const audience = await getSmsAudience(product);
    const eligible = await filterSmsOptOuts(audience.map((a) => a.phone));
    return NextResponse.json({ product, channel, count: eligible.length });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
