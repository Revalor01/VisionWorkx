import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/social/adminAuth";
import { generateDerivativesForItem, type RequestedDerivative } from "@/lib/content/repurpose";
import type { ContentDerivativeChannel, MarketingAutonomy, SocialPlatform } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 300;

const VALID_CHANNELS: ContentDerivativeChannel[] = ["blog", "social", "email", "push", "sms"];

interface RequestBody {
  channels?: { channel?: ContentDerivativeChannel; autonomy?: MarketingAutonomy; platforms?: SocialPlatform[] }[];
  socialBrandId?: string;
}

export async function POST(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const requested = (body.channels ?? []).filter((c): c is { channel: ContentDerivativeChannel; autonomy: MarketingAutonomy; platforms?: SocialPlatform[] } =>
    !!c.channel && VALID_CHANNELS.includes(c.channel)
  );
  if (requested.length === 0) {
    return NextResponse.json({ error: "At least one valid channel is required" }, { status: 400 });
  }
  if (requested.some((c) => c.channel === "social") && !body.socialBrandId) {
    return NextResponse.json({ error: "socialBrandId is required to generate a social derivative" }, { status: 400 });
  }

  try {
    await generateDerivativesForItem({
      contentItemId: params.id,
      requested: requested.map<RequestedDerivative>((c) => ({
        channel: c.channel,
        autonomy: c.autonomy === "auto" ? "auto" : "manual",
        platforms: c.platforms,
      })),
      socialBrandId: body.socialBrandId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
