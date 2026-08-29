import { NextRequest, NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { isAdmin } from "@/lib/social/authGuard";
import type { Database } from "@/lib/database.types";

type BrandUpdate = Database["public"]["Tables"]["social_brands"]["Update"];

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    name?: string;
    voiceNotes?: string;
    faqDocument?: string;
    websiteUrl?: string;
    autonomyEnabled?: boolean;
    autonomyMode?: "manual" | "semi_autonomous" | "fully_autonomous";
    bannedWords?: string[];
    contentTopics?: string[];
    postingFrequencyPerDay?: number;
    resumeAutonomy?: boolean;
    disconnectPlatform?: "facebook" | "instagram" | "tiktok" | "youtube";
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: BrandUpdate = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) update.name = body.name;
  if (body.voiceNotes !== undefined) update.voice_notes = body.voiceNotes;
  if (body.faqDocument !== undefined) update.faq_document = body.faqDocument;
  if (body.websiteUrl !== undefined) update.website_url = body.websiteUrl || null;
  if (body.autonomyEnabled !== undefined) update.autonomy_enabled = body.autonomyEnabled;
  if (body.autonomyMode !== undefined) update.autonomy_mode = body.autonomyMode;
  if (body.bannedWords !== undefined) update.banned_words = body.bannedWords;
  if (body.contentTopics !== undefined) update.content_topics = body.contentTopics;
  if (body.postingFrequencyPerDay !== undefined) update.posting_frequency_per_day = body.postingFrequencyPerDay;
  if (body.resumeAutonomy) {
    update.autonomy_paused_at = null;
    update.autonomy_paused_reason = null;
  }
  if (body.disconnectPlatform) {
    switch (body.disconnectPlatform) {
      case "facebook":
        update.fb_page_id = null;
        break;
      case "instagram":
        update.socialapi_account_id = null;
        break;
      case "tiktok":
        update.socialapi_tiktok_account_id = null;
        break;
      case "youtube":
        update.socialapi_youtube_account_id = null;
        break;
      default:
        return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
    }
  }

  const service = createServiceClient();
  const { error } = await service.from("social_brands").update(update).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdmin(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceClient();
  const { error } = await service.from("social_brands").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
