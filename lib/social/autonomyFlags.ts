import type { createServiceClient } from "@/lib/supabase";
import { sendAutonomyAlert } from "@/lib/social/alerts";
import type { SocialAutonomyFlagKind } from "@/lib/database.types";

// Shared by the generate cron, the publish cron, and the inbound-DM webhook —
// one place to record a flag, alert, and (except for inbox escalations,
// which DM auto-reply already fails safe on) pause that brand's autonomy
// until a human resumes it from the dashboard.
export async function raiseAutonomyFlag(
  service: ReturnType<typeof createServiceClient>,
  params: {
    brandId: string;
    brandName: string;
    contentId?: string;
    kind: SocialAutonomyFlagKind;
    detail: string;
    pauseBrand?: boolean;
  }
): Promise<void> {
  const { brandId, brandName, contentId, kind, detail, pauseBrand = true } = params;

  await service.from("social_autonomy_flags").insert({
    brand_id: brandId,
    content_id: contentId ?? null,
    kind,
    detail,
  });

  if (pauseBrand) {
    await service
      .from("social_brands")
      .update({ autonomy_paused_at: new Date().toISOString(), autonomy_paused_reason: detail })
      .eq("id", brandId);
  }

  await sendAutonomyAlert({ brandName, kind, detail });
}
