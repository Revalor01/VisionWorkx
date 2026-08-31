import { permanentRedirect } from "next/navigation";

// The blog moved to products.revalorllc.com (per-brand: /business/blog,
// /kids/blog, /wellness/blog). Keep this path as a 301 so old links and
// search results land somewhere useful.
export default function LegacyBlogIndex() {
  permanentRedirect("https://products.revalorllc.com/business/blog");
}
