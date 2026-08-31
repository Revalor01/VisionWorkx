import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://vision-workx.vercel.app";

// Blog content now lives at products.revalorllc.com/{section}/blog/* —
// /blog and /blog/:slug here 301 there (app/blog/*), so they're
// intentionally not listed. The shared blog_posts table is still
// generated from this repo; only the public rendering moved.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    {
      url: `${SITE_URL}/web-app-vs-web-page`,
      changeFrequency: "yearly",
      priority: 0.6,
    },
  ];
}
