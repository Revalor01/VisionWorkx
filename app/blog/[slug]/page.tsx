import { notFound } from "next/navigation";
import { marked } from "marked";
import Navbar from "@/components/nav/Navbar";
import Footer from "@/components/nav/Footer";
import { createServiceClient } from "@/lib/supabase";
import { PRODUCTS } from "@/lib/blog/products";

export const revalidate = 3600;

async function getPost(slug: string) {
  const service = createServiceClient();
  const { data } = await service
    .from("blog_posts")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug);
  if (!post) return {};
  return {
    title: `${post.title} — Revalor Blog`,
    description: post.meta_description ?? post.excerpt ?? undefined,
  };
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug);
  if (!post) notFound();

  const product = PRODUCTS[post.product];
  const bodyHtml = marked.parse(post.body, { async: false }) as string;

  const faqSchema =
    post.faqs && post.faqs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: post.faqs.map((faq) => ({
            "@type": "Question",
            name: faq.question,
            acceptedAnswer: { "@type": "Answer", text: faq.answer },
          })),
        }
      : null;

  return (
    <div className="min-h-screen bg-off-white flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-12">
        {faqSchema && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
          />
        )}

        <span className="text-xs font-semibold uppercase tracking-wide text-navy">{product.name}</span>
        <h1 className="text-3xl font-bold text-navy-dark mt-1 mb-2">{post.title}</h1>
        {post.published_at && (
          <p className="text-xs text-gray-400 mb-8">
            {new Date(post.published_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        )}

        <article
          className="prose prose-sm sm:prose-base max-w-none text-gray-700 prose-headings:text-navy-dark prose-a:text-navy"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />

        {post.faqs && post.faqs.length > 0 && (
          <section className="mt-10 border-t border-gray-200 pt-8">
            <h2 className="text-xl font-bold text-navy-dark mb-4">Frequently Asked Questions</h2>
            <div className="space-y-4">
              {post.faqs.map((faq, i) => (
                <div key={i}>
                  <p className="font-semibold text-navy-dark">{faq.question}</p>
                  <p className="text-sm text-gray-600 mt-1">{faq.answer}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="mt-12 bg-navy-dark rounded-2xl p-8 text-center text-white">
          <p className="text-lg font-semibold mb-2">Want to see {product.name} for yourself?</p>
          <p className="text-blue-100 text-sm mb-5">{product.niche}</p>
          <a
            href={product.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-white text-navy-dark font-semibold px-6 py-3 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Try {product.name} →
          </a>
        </div>
      </main>
      <Footer />
    </div>
  );
}
