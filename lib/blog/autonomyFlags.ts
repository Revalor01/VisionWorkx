import type { createServiceClient } from "@/lib/supabase";
import { sendBlogAutonomyAlert } from "./alerts";
import type { BlogProduct } from "./products";

// Called only for a banned-word hit on a non-manual product — manual mode
// never auto-publishes anyway, so there's nothing to pause. Mirrors
// lib/social/autonomyFlags.ts's raiseAutonomyFlag, scoped to blog products.
export async function raiseBlogAutonomyFlag(
  service: ReturnType<typeof createServiceClient>,
  params: { product: BlogProduct; productName: string; postId: string; detail: string }
): Promise<void> {
  const { product, productName, postId, detail } = params;

  await service.from("blog_autonomy_flags").insert({
    product,
    post_id: postId,
    kind: "banned_word",
    detail,
  });

  await service
    .from("blog_product_config")
    .update({ autonomy_paused_at: new Date().toISOString(), autonomy_paused_reason: detail })
    .eq("product", product);

  await sendBlogAutonomyAlert({ productName, detail });
}
