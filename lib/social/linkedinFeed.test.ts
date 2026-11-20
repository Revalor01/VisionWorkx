import { describe, expect, it } from "vitest";
import { buildFeedXml, duePosts, feedTokenValid, postText, postsToMarkPosted } from "./linkedinFeed";

const NOW = Date.parse("2026-11-24T14:30:00Z");
const min = 60_000;
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const post = (id: string, scheduledOffset: number | null, extra: Record<string, unknown> = {}) => ({
  id,
  hook: "A client lost three quote requests in one weekend.",
  caption: "So we fixed that.\n\nHere's how.",
  hashtags: ["smallbusiness", "#automation"],
  product: "revalor_consulting" as const,
  scheduled_at: scheduledOffset === null ? null : iso(scheduledOffset),
  ...extra,
});

describe("feedTokenValid", () => {
  it("accepts only an exact match", () => {
    expect(feedTokenValid("abc123", "abc123")).toBe(true);
    expect(feedTokenValid("abc124", "abc123")).toBe(false);
    expect(feedTokenValid("abc", "abc123")).toBe(false);
  });
  it("rejects when the secret or token is missing", () => {
    expect(feedTokenValid("abc", undefined)).toBe(false);
    expect(feedTokenValid("abc", "")).toBe(false);
    expect(feedTokenValid(null, "abc")).toBe(false);
    expect(feedTokenValid("", "abc")).toBe(false);
  });
});

describe("postText", () => {
  it("puts hook, caption and #hashtags together", () => {
    expect(postText(post("a", 0))).toBe(
      "A client lost three quote requests in one weekend.\n\nSo we fixed that.\n\nHere's how.\n\n#smallbusiness #automation",
    );
  });
  it("doesn't repeat a hook the caption already starts with", () => {
    expect(postText({ hook: "Hook.", caption: "Hook. Rest.", hashtags: [] })).toBe("Hook. Rest.");
  });
  it("works without a hook or hashtags", () => {
    expect(postText({ hook: null, caption: "Just this.", hashtags: [] })).toBe("Just this.");
  });
});

describe("duePosts", () => {
  it("includes posts due now or in the last 48h, newest first, and skips future/old/unscheduled", () => {
    const posts = [
      post("future", 5 * min),
      post("now", 0),
      post("hourAgo", -60 * min),
      post("tooOld", -49 * 60 * min),
      post("unscheduled", null),
    ];
    expect(duePosts(posts, NOW).map((p) => p.id)).toEqual(["now", "hourAgo"]);
  });
});

describe("postsToMarkPosted", () => {
  it("only marks posts due for at least 30 minutes", () => {
    const posts = [post("fresh", -10 * min), post("ready", -31 * min), post("future", 10 * min)];
    expect(postsToMarkPosted(posts, NOW).map((p) => p.id)).toEqual(["ready"]);
  });
});

describe("buildFeedXml", () => {
  it("emits one escaped item per due post with a stable guid", () => {
    const xml = buildFeedXml(
      [post("p1", -5 * min, { caption: "Tools <cheap> & fast" }), post("later", 60 * min)],
      "https://vision-workx.vercel.app",
      NOW,
    );
    expect(xml).toContain('<rss version="2.0">');
    expect(xml.match(/<item>/g)).toHaveLength(1);
    expect(xml).toContain("Tools &lt;cheap&gt; &amp; fast");
    expect(xml).toContain(`<guid isPermaLink="false">linkedin-p1-${NOW - 5 * min}</guid>`);
    expect(xml).not.toContain("later");
  });
  it("adds an enclosure only for posts with an image and a signed link", () => {
    const xml = buildFeedXml(
      [post("img", -2 * min, { image_path: "linkedin/img/a.png" }), post("noimg", -3 * min)],
      "https://x.test",
      NOW,
      { img: "https://storage.test/sign?token=a&b=1" },
    );
    expect(xml).toContain('<enclosure url="https://storage.test/sign?token=a&amp;b=1" length="0" type="image/png" />');
    expect(xml.match(/<enclosure/g)).toHaveLength(1);
  });
  it("strips control characters XML can't carry", () => {
    const xml = buildFeedXml([post("p2", -1 * min, { caption: "Bad\u0007char\u0000s" })], "https://x.test", NOW);
    expect(xml).toContain("Badchars");
    expect(xml).not.toMatch(/[\u0000\u0007]/);
  });
  it("is a valid empty channel when nothing is due", () => {
    const xml = buildFeedXml([], "https://x.test", NOW);
    expect(xml).toContain("<channel>");
    expect(xml).not.toContain("<item>");
  });
});
