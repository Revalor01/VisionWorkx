import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { generateAdCopy, type AdObjective, type AdTone } from "@/lib/promote/copyGenerator";
import { fetchImageBuffer, renderAdTemplate, type TemplateId } from "@/lib/promote/templateRenderer";
import { limitsForPlan } from "@/lib/promote/planGates";
import { isAdmin } from "@/lib/social/authGuard";
import type { PromoteCreativeFormat } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 120;

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
// In-memory best-effort limiter — resets on cold start, fine for this scale.
const rateLimitHits = new Map<string, number[]>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const hits = (rateLimitHits.get(userId) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= RATE_LIMIT_MAX) {
    rateLimitHits.set(userId, hits);
    return false;
  }
  hits.push(now);
  rateLimitHits.set(userId, hits);
  return true;
}

interface GeneratePayload {
  objective: AdObjective;
  tone: AdTone;
  templateIds: TemplateId[];
  count: number;
  format?: PromoteCreativeFormat;
}

export async function POST(req: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!checkRateLimit(user.id)) {
    return NextResponse.json({ error: "Rate limit exceeded — try again in a minute" }, { status: 429 });
  }

  let body: GeneratePayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { objective, tone, templateIds, count } = body;
  const format: PromoteCreativeFormat = body.format ?? "1080x1080";

  if (!objective || !tone || !Array.isArray(templateIds) || templateIds.length === 0 || !count) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (count < 1 || count > 9) {
    return NextResponse.json({ error: "count must be between 1 and 9" }, { status: 400 });
  }

  const serviceClient = createServiceClient();

  const { data: business } = await serviceClient
    .from("promote_businesses")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!business) {
    return NextResponse.json({ error: "Complete onboarding before generating ads" }, { status: 404 });
  }

  const { data: sub } = await serviceClient
    .from("promote_subscriptions")
    .select("plan, status")
    .eq("user_id", user.id)
    .maybeSingle();

  const activePlan = isAdmin(user)
    ? "pro"
    : sub?.status === "active" || sub?.status === "trialing"
      ? sub.plan
      : null;
  const limits = limitsForPlan(activePlan);

  if (limits.creativesPerMonth !== -1) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { count: usedThisMonth } = await serviceClient
      .from("promote_creatives")
      .select("id", { count: "exact", head: true })
      .eq("business_id", business.id)
      .gte("created_at", monthStart.toISOString());

    if ((usedThisMonth ?? 0) + count > limits.creativesPerMonth) {
      return NextResponse.json(
        { error: "PLAN_LIMIT", upgrade: true, message: `Your plan allows ${limits.creativesPerMonth} creatives/month` },
        { status: 403 }
      );
    }
  }

  try {
    const services = Array.isArray(business.services) ? business.services : [];
    const variants = await generateAdCopy({
      businessName: business.name,
      businessType: business.business_type,
      services: services.map((s) => ({ name: s.name, price: s.price })),
      city: business.city ?? "",
      objective,
      tone,
      count,
    });

    const [logoBuffer, photoBuffer] = await Promise.all([
      fetchImageBuffer(business.logo_url),
      fetchImageBuffer(business.photo_urls?.[0] ?? null),
    ]);

    const created: { id: string; imageUrl: string; headline: string }[] = [];

    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      const templateId = templateIds[i % templateIds.length];

      const png = await renderAdTemplate({
        templateId,
        businessName: business.name,
        headline: variant.headline,
        bodyText: variant.bodyText,
        cta: variant.cta,
        logoBuffer,
        photoBuffer,
        brandColor: business.brand_color,
        format,
      });

      const path = `${user.id}/creatives/${crypto.randomUUID()}.png`;
      const { error: uploadError } = await serviceClient.storage
        .from("promote-assets")
        .upload(path, png, { contentType: "image/png", upsert: false });

      if (uploadError) {
        console.error("[creatives/generate] upload failed:", uploadError.message);
        continue;
      }

      const { data: publicUrl } = serviceClient.storage.from("promote-assets").getPublicUrl(path);

      const { data: creative, error: insertError } = await serviceClient
        .from("promote_creatives")
        .insert({
          business_id: business.id,
          name: `${variant.headline.slice(0, 30)}`,
          headline: variant.headline,
          body_text: variant.bodyText,
          cta: variant.cta,
          script: variant.script,
          image_url: publicUrl.publicUrl,
          template_id: templateId,
          format,
          status: "draft",
        })
        .select("id, image_url, headline")
        .single();

      if (insertError) {
        console.error("[creatives/generate] insert failed:", insertError.message);
        continue;
      }

      created.push({ id: creative.id, imageUrl: creative.image_url, headline: creative.headline });
    }

    if (created.length === 0) {
      return NextResponse.json({ error: "Failed to generate any creatives" }, { status: 500 });
    }

    return NextResponse.json({ creatives: created }, { status: 201 });
  } catch (err) {
    console.error("[creatives/generate]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
