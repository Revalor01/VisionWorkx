// SEO quality scoring — direct TS port of the original seo-automation
// Python script's optimizer.py. Same checks, same point weights.

import type { GeneratedPost } from "./content";

export interface SEOReport {
  score: number;
  passed: string[];
  warnings: string[];
  errors: string[];
}

function checkTitle(title: string, keyword: string, r: SEOReport): number {
  let points = 0;
  const len = title.length;

  if (title.toLowerCase().includes(keyword.toLowerCase())) {
    r.passed.push(`Title contains keyword "${keyword}"`);
    points += 15;
  } else {
    r.errors.push(`Title does not contain keyword "${keyword}"`);
  }

  if (len >= 50 && len <= 60) {
    r.passed.push(`Title length is ideal (${len} chars)`);
    points += 10;
  } else if (len >= 40 && len < 50) {
    r.warnings.push(`Title is a bit short (${len} chars, ideal: 50-60)`);
    points += 5;
  } else if (len > 60) {
    r.warnings.push(`Title too long (${len} chars) — will be truncated after 60`);
    points += 5;
  } else {
    r.errors.push(`Title too short (${len} chars)`);
  }

  return points;
}

function checkMeta(meta: string, keyword: string, r: SEOReport): number {
  let points = 0;
  const len = meta.length;

  if (meta.toLowerCase().includes(keyword.toLowerCase())) {
    r.passed.push("Meta description contains keyword");
    points += 10;
  } else {
    r.warnings.push(`Meta description should include keyword "${keyword}"`);
  }

  if (len >= 150 && len <= 160) {
    r.passed.push(`Meta length is ideal (${len} chars)`);
    points += 10;
  } else if (len >= 130 && len < 150) {
    r.warnings.push(`Meta slightly short (${len} chars, ideal: 150-160)`);
    points += 5;
  } else if (len > 160) {
    r.warnings.push(`Meta too long (${len} chars) — will be cut in search results`);
    points += 5;
  } else {
    r.errors.push(`Meta description too short (${len} chars)`);
  }

  return points;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function checkKeywordDensity(content: string, keyword: string, r: SEOReport): number {
  const words = content.match(/\w+/g) ?? [];
  const totalWords = words.length;
  if (totalWords === 0) return 0;

  const keywordWords = keyword.trim().split(/\s+/);
  const matches = content.toLowerCase().match(new RegExp(escapeRegExp(keyword.toLowerCase()), "g")) ?? [];
  const density = ((matches.length * keywordWords.length) / totalWords) * 100;

  if (density >= 1.0 && density <= 2.0) {
    r.passed.push(`Keyword density is ideal (${density.toFixed(1)}%)`);
    return 15;
  } else if (density >= 0.5 && density < 1.0) {
    r.warnings.push(`Keyword density low (${density.toFixed(1)}%) — try using "${keyword}" a bit more`);
    return 8;
  } else if (density > 2.0) {
    r.warnings.push(`Keyword density high (${density.toFixed(1)}%) — could look like keyword stuffing`);
    return 5;
  } else {
    r.errors.push(`Keyword "${keyword}" barely appears in content (${density.toFixed(1)}%)`);
    return 0;
  }
}

function checkHeadings(content: string, keyword: string, r: SEOReport): number {
  let points = 0;
  const h2s = content.match(/^## .+/gm) ?? [];
  const h3s = content.match(/^### .+/gm) ?? [];

  if (h2s.length >= 3) {
    r.passed.push(`Good heading structure (${h2s.length} H2s, ${h3s.length} H3s)`);
    points += 10;
  } else if (h2s.length >= 1) {
    r.warnings.push(`Only ${h2s.length} H2 headings — aim for 3+`);
    points += 5;
  } else {
    r.errors.push("No H2 headings found — content needs clear sections");
  }

  const allHeadings = [...h2s, ...h3s].join(" ").toLowerCase();
  if (allHeadings.includes(keyword.toLowerCase())) {
    r.passed.push("Keyword appears in a subheading");
    points += 5;
  } else {
    r.warnings.push(`Try including "${keyword}" in at least one H2 or H3`);
  }

  return points;
}

function checkIntro(content: string, keyword: string, r: SEOReport): number {
  const words = content.match(/\w+/g) ?? [];
  const first100 = words.slice(0, 100).join(" ").toLowerCase();
  const kwWords = keyword.toLowerCase().split(/\s+/);

  if (first100.includes(keyword.toLowerCase()) || kwWords.every((w) => first100.includes(w))) {
    r.passed.push("Keyword appears in the first 100 words");
    return 10;
  }
  r.warnings.push(`Try mentioning "${keyword}" in the opening paragraph`);
  return 0;
}

function checkWordCount(content: string, r: SEOReport, minWords = 900): number {
  const wordCount = (content.match(/\w+/g) ?? []).length;
  if (wordCount >= minWords) {
    r.passed.push(`Word count is sufficient (${wordCount} words)`);
    return 10;
  } else if (wordCount >= minWords * 0.8) {
    r.warnings.push(`Word count slightly short (${wordCount} words, target: ${minWords}+)`);
    return 5;
  } else {
    r.errors.push(`Content too short (${wordCount} words) — needs at least ${minWords}`);
    return 0;
  }
}

function checkFaqs(faqs: unknown[], r: SEOReport): number {
  const count = faqs?.length ?? 0;
  if (count >= 5) {
    r.passed.push(`FAQs included (${count} questions — good for featured snippets)`);
    return 5;
  } else if (count >= 3) {
    r.warnings.push(`Only ${count} FAQs — aim for 5`);
    return 3;
  } else {
    r.errors.push("Fewer than 3 FAQs — FAQ schema won't be effective");
    return 0;
  }
}

function checkSlug(slug: string, keyword: string, r: SEOReport): number {
  let points = 0;
  const slugWords = slug.replace(/-/g, " ");
  const kwWords = keyword.toLowerCase().split(/\s+/);

  if (kwWords.every((w) => slugWords.includes(w))) {
    r.passed.push("URL slug contains the keyword");
    points += 5;
  } else {
    r.warnings.push(`URL slug should include keyword "${keyword}"`);
  }

  if (slug.length > 60) {
    r.warnings.push(`URL slug is long (${slug.length} chars) — keep under 60`);
  }

  return points;
}

export function scorePost(post: GeneratedPost, keyword: string, minWords = 900): SEOReport {
  const report: SEOReport = { score: 0, passed: [], warnings: [], errors: [] };

  let total = 0;
  total += checkTitle(post.title, keyword, report);
  total += checkMeta(post.meta_description, keyword, report);
  total += checkKeywordDensity(post.content, keyword, report);
  total += checkHeadings(post.content, keyword, report);
  total += checkIntro(post.content, keyword, report);
  total += checkWordCount(post.content, report, minWords);
  total += checkFaqs(post.faqs, report);
  total += checkSlug(post.slug, keyword, report);

  report.score = Math.min(total, 100);
  return report;
}
