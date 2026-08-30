import { createServiceClient } from "@/lib/supabase";
import { PRODUCTS as BLOG_PRODUCTS } from "@/lib/blog/products";
import { generateBlogPost } from "@/lib/blog/content";
import { scorePost } from "@/lib/blog/optimizer";
import { containsBannedWords as blogBannedWords, BASE_BANNED_WORDS, AUTO_PUBLISH_SCORE_THRESHOLD } from "@/lib/blog/safety";
import { generateContentCalendar } from "@/lib/social/contentGenerator";
import { evaluateApproval } from "@/lib/social/riskEvaluator";
import { connectedPlatforms } from "@/lib/social/connectedPlatforms";
import { pickPostingSlots } from "@/lib/social/postingSlots";
import { raiseAutonomyFlag } from "@/lib/social/autonomyFlags";
import { generateEmailCampaign } from "@/lib/marketing/emailGenerator";
import { getSendableAudience } from "@/lib/marketing/audience";
import { sendCampaign } from "@/lib/marketing/sendCampaign";
import { PRODUCT_LABEL } from "@/lib/marketing/products";
import { generatePushCampaign, generateSmsCampaign } from "@/lib/mobile/generator";
import { getPushAudience, getSmsAudience, filterSmsOptOuts } from "@/lib/mobile/audience";
import { sendMobileCampaign } from "@/lib/mobile/sendCampaign";
import type { ContentDerivativeChannel, ContentDerivativeStatus, ContentItem, MarketingAutonomy, SocialPlatform } from "@/lib/database.types";

type Service = ReturnType<typeof createServiceClient>;

export interface RequestedDerivative {
  channel: ContentDerivativeChannel;
  // Only meaningful for channel="social" — if omitted, resolves to every
  // platform the target brand has connected.
  platforms?: SocialPlatform[];
  autonomy: MarketingAutonomy;
}

// Creates the content_derivatives rows for one source item and generates +
// dispatches each of them. Every generator/sender call below is one this
// codebase already had (Project 02/04's email/push/sms, the pre-existing
// blog and social engines) — this function only orchestrates, it doesn't
// reimplement any of them.
export async function generateDerivativesForItem(params: {
  contentItemId: string;
  requested: RequestedDerivative[];
  socialBrandId?: string; // required if any requested entry is channel="social"
}): Promise<void> {
  const service = createServiceClient();
  const { data: item, error: itemError } = await service.from("content_items").select("*").eq("id", params.contentItemId).maybeSingle();
  if (itemError) throw new Error(itemError.message);
  if (!item) throw new Error("Content item not found");

  for (const req of params.requested) {
    if (req.channel === "blog") {
      const { data: derivative, error } = await service
        .from("content_derivatives")
        .insert({ content_item_id: item.id, channel: "blog", autonomy: req.autonomy, status: "pending" })
        .select("id")
        .single();
      if (error || !derivative) continue;
      await generateBlogDerivative(service, item, derivative.id, req.autonomy);
      continue;
    }

    if (req.channel === "email" || req.channel === "push" || req.channel === "sms") {
      const { data: derivative, error } = await service
        .from("content_derivatives")
        .insert({ content_item_id: item.id, channel: req.channel, autonomy: req.autonomy, status: "pending" })
        .select("id")
        .single();
      if (error || !derivative) continue;
      await generateMarketingDerivative(service, item, req.channel, derivative.id, req.autonomy);
      continue;
    }

    // channel === "social"
    if (!params.socialBrandId) continue;
    const { data: brand } = await service.from("social_brands").select("*").eq("id", params.socialBrandId).maybeSingle();
    if (!brand) continue;
    const available = await connectedPlatforms(service, brand);
    const platforms = req.platforms?.length ? req.platforms.filter((p) => available.includes(p)) : available;
    if (platforms.length === 0) continue;

    await generateSocialDerivatives(service, item, brand.id, platforms, req.autonomy);
  }
}

async function markDerivative(
  service: Service,
  id: string,
  patch: {
    status: ContentDerivativeStatus;
    subject?: string | null;
    body?: string | null;
    error?: string | null;
    blog_post_id?: string;
    social_content_id?: string;
    marketing_campaign_id?: string;
  }
) {
  await service.from("content_derivatives").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
}

// --- Blog -------------------------------------------------------------

async function generateBlogDerivative(service: Service, item: ContentItem, derivativeId: string, autonomy: MarketingAutonomy): Promise<void> {
  try {
    const productConfig = BLOG_PRODUCTS[item.product];
    const piece = await generateBlogPost(item.title, productConfig);
    const report = scorePost(piece, item.title);
    const banned = blogBannedWords(`${piece.title} ${piece.excerpt} ${piece.content}`, BASE_BANNED_WORDS);

    // Reuses the blog pipeline's own quality/safety bar (same threshold,
    // same banned-word check) rather than inventing a separate one — auto
    // still means "auto if it clears the bar," not "auto no matter what."
    const autoPublish = autonomy === "auto" && banned.length === 0 && report.score >= AUTO_PUBLISH_SCORE_THRESHOLD;

    let slug = piece.slug;
    let suffix = 2;
    while (true) {
      const { data: clash } = await service.from("blog_posts").select("id").eq("slug", slug).maybeSingle();
      if (!clash) break;
      slug = `${piece.slug}-${suffix}`;
      suffix++;
    }

    const { data: post, error } = await service
      .from("blog_posts")
      .insert({
        product: item.product,
        keyword: item.title,
        title: piece.title,
        slug,
        meta_description: piece.meta_description,
        excerpt: piece.excerpt,
        body: piece.content,
        faqs: piece.faqs,
        tags: piece.tags,
        seo_score: report.score,
        status: autoPublish ? "published" : "draft",
        published_at: autoPublish ? new Date().toISOString() : null,
        auto_published: autoPublish,
      })
      .select("id")
      .single();
    if (error || !post) throw new Error(error?.message ?? "insert failed");

    await markDerivative(service, derivativeId, {
      status: autoPublish ? "published" : "pending_review",
      subject: piece.title,
      body: piece.excerpt,
      blog_post_id: post.id,
    });
  } catch (err) {
    await markDerivative(service, derivativeId, { status: "failed", error: (err as Error).message });
  }
}

// --- Email / push / sms ------------------------------------------------

async function generateMarketingDerivative(
  service: Service,
  item: ContentItem,
  channel: "email" | "push" | "sms",
  derivativeId: string,
  autonomy: MarketingAutonomy
): Promise<void> {
  try {
    const productLabel = PRODUCT_LABEL[item.product];
    const goal = `${item.title}\n\n${item.body}`.slice(0, 4000);

    let subject = "";
    let body = "";
    if (channel === "email") {
      const generated = await generateEmailCampaign({ productLabel, voiceNotes: null, goal });
      subject = generated.subject;
      body = generated.bodyHtml;
    } else if (channel === "push") {
      const generated = await generatePushCampaign({ productLabel, voiceNotes: null, goal });
      subject = generated.title;
      body = generated.body;
    } else {
      const generated = await generateSmsCampaign({ productLabel, voiceNotes: null, goal });
      body = generated.body;
    }

    const { data: campaign, error } = await service
      .from("marketing_campaigns")
      .insert({
        product: item.product,
        channel,
        subject,
        body_html: body,
        status: autonomy === "auto" ? "generated" : "pending_review",
        autonomy,
        goal: item.title,
      })
      .select("id")
      .single();
    if (error || !campaign) throw new Error(error?.message ?? "insert failed");

    if (autonomy === "auto") {
      if (channel === "email") {
        const recipients = await getSendableAudience(item.product);
        await sendCampaign(campaign.id, recipients.map((r) => r.email));
      } else {
        const recipients =
          channel === "push"
            ? (await getPushAudience(item.product)).map((r) => r.token)
            : await filterSmsOptOuts((await getSmsAudience(item.product)).map((r) => r.phone));
        await sendMobileCampaign(campaign.id, recipients);
      }
      await markDerivative(service, derivativeId, { status: "published", subject, body, marketing_campaign_id: campaign.id });
    } else {
      await markDerivative(service, derivativeId, { status: "pending_review", subject, body, marketing_campaign_id: campaign.id });
    }
  } catch (err) {
    await markDerivative(service, derivativeId, { status: "failed", error: (err as Error).message });
  }
}

// --- Social --------------------------------------------------------------

async function generateSocialDerivatives(
  service: Service,
  item: ContentItem,
  brandId: string,
  platforms: SocialPlatform[],
  autonomy: MarketingAutonomy
): Promise<void> {
  const { data: brand } = await service.from("social_brands").select("*").eq("id", brandId).maybeSingle();
  if (!brand) return;

  // One derivative row per platform, created up front so a generation
  // failure still leaves a visible "failed" row per platform instead of
  // silently producing nothing.
  const rows = await Promise.all(
    platforms.map(async (platform) => {
      const { data } = await service
        .from("content_derivatives")
        .insert({ content_item_id: item.id, channel: "social", platform, autonomy, status: "pending" })
        .select("id")
        .single();
      return { platform, derivativeId: data?.id };
    })
  );

  try {
    const posts = await generateContentCalendar({
      brandName: brand.name,
      voiceNotes: brand.voice_notes,
      platforms,
      postCount: platforms.length,
      topics: [`${item.title} — ${item.body}`.slice(0, 500)],
    });

    const slots = pickPostingSlots(posts.length);

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      const row = rows.find((r) => r.platform === post.platform) ?? rows[i];
      if (!row?.derivativeId) continue;

      // "manual" always holds for review regardless of risk; "auto" defers
      // to the brand's own risk-based approval — respecting the Social
      // Media Manager's existing autonomy dial rather than overriding it.
      const { status, reason } =
        autonomy === "manual"
          ? { status: "review" as const, reason: "Manual mode — content engine derivative" }
          : evaluateApproval({ copy: post.caption, riskLevel: post.riskLevel, bannedWords: brand.banned_words, autonomyMode: brand.autonomy_mode });

      if (status === "reject") {
        await raiseAutonomyFlag(service, {
          brandId: brand.id,
          brandName: brand.name,
          kind: "banned_word",
          detail: `Content engine derivative rejected before publishing — ${reason}`,
          pauseBrand: false,
        });
        await markDerivative(service, row.derivativeId, { status: "failed", error: reason ?? "rejected" });
        continue;
      }

      const { data: inserted, error } = await service
        .from("social_content")
        .insert({
          brand_id: brand.id,
          platform: post.platform,
          hook: post.hook,
          caption: post.caption,
          hashtags: post.hashtags,
          risk_level: post.riskLevel,
          generated_by: "content_engine",
          status: status === "auto" ? "scheduled" : "draft",
          scheduled_at: status === "auto" ? slots[i] : null,
        })
        .select("id")
        .single();
      if (error || !inserted) {
        await markDerivative(service, row.derivativeId, { status: "failed", error: error?.message ?? "insert failed" });
        continue;
      }

      await markDerivative(service, row.derivativeId, {
        status: status === "auto" ? "approved" : "pending_review",
        subject: post.hook,
        body: post.caption,
        social_content_id: inserted.id,
      });
    }
  } catch (err) {
    await Promise.all(
      rows.filter((r) => r.derivativeId).map((r) => markDerivative(service, r.derivativeId!, { status: "failed", error: (err as Error).message }))
    );
  }
}
