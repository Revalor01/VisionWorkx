import { permanentRedirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase";

// The blog moved to products.revalorllc.com, split per brand. Look up the
// post's product, map it to a section, and 301 to the new canonical URL
// so link equity and search results transfer.
const SECTION: Record<string, "business" | "kids" | "wellness"> = {
  visionworkx: "business",
  chorebit: "kids",
  feelflow: "kids",
  mindbit: "kids",
  sanctum: "wellness",
};

const PRODUCTS_SITE = "https://products.revalorllc.com";

export default async function LegacyBlogPost(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;

  const service = createServiceClient();
  const { data } = await service
    .from("blog_posts")
    .select("product")
    .eq("slug", slug)
    .maybeSingle();

  const section = data ? SECTION[data.product] : undefined;
  permanentRedirect(
    section
      ? `${PRODUCTS_SITE}/${section}/blog/${slug}`
      : `${PRODUCTS_SITE}/business/blog`
  );
}
