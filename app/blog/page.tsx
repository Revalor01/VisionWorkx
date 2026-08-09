import Link from "next/link";
import Navbar from "@/components/nav/Navbar";
import Footer from "@/components/nav/Footer";
import { createServiceClient } from "@/lib/supabase";
import { PRODUCTS } from "@/lib/blog/products";

export const metadata = {
  title: "Blog — Revalor",
  description: "Guides and tips from the team behind VisionWorkx, Chorebit, FeelFlow, MindBit, and Sanctum.",
};

export const revalidate = 3600;

export default async function BlogIndexPage() {
  const service = createServiceClient();
  const { data: posts } = await service
    .from("blog_posts")
    .select("id, product, title, slug, excerpt, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  return (
    <div className="min-h-screen bg-off-white flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-12">
        <h1 className="text-3xl font-bold text-navy-dark mb-2">Blog</h1>
        <p className="text-gray-500 mb-10">
          Guides and tips from the team behind VisionWorkx, Chorebit, FeelFlow, MindBit, and Sanctum.
        </p>

        <div className="space-y-6">
          {(posts ?? []).map((post) => (
            <Link
              key={post.id}
              href={`/blog/${post.slug}`}
              className="block bg-white border border-gray-200 rounded-2xl p-6 hover:border-navy hover:shadow-lg transition-all"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-navy">
                {PRODUCTS[post.product].name}
              </span>
              <h2 className="text-xl font-bold text-navy-dark mt-1">{post.title}</h2>
              {post.excerpt && <p className="text-sm text-gray-600 mt-2">{post.excerpt}</p>}
              {post.published_at && (
                <p className="text-xs text-gray-400 mt-3">
                  {new Date(post.published_at).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              )}
            </Link>
          ))}

          {(posts ?? []).length === 0 && (
            <p className="text-gray-400 text-center py-16">No posts published yet — check back soon.</p>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
