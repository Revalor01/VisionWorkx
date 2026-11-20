import { expect, qa } from "../../lib/qa";

// VisionWorkx Social (/admin/social). Black-box: the QA runner has no admin
// session, so this checks the campaign import stays admin-only.

qa(
  { id: "visionworkx/social/import-requires-admin", area: "Social", title: "Importing posts needs the admin" },
  async ({ request }) => {
    const res = await request.post("/api/social/content/import", {
      data: { brand: "Revalor LLC", posts: [{ platform: "facebook", caption: "qa", scheduledAt: "2099-01-01T10:00:00Z" }] },
    });
    expect(res.status()).toBe(401);
    expect((await request.post("/api/social/content/import?dry=1", { data: {} })).status()).toBe(401);
  },
);

qa({ id: "visionworkx/social/images-cron-requires-secret", area: "Social", title: "Automatic image job needs the cron secret" }, async ({ request }) => {
  expect((await request.get("/api/cron/social-images")).status()).toBe(401);
  const wrong = await request.get("/api/cron/social-images", { headers: { authorization: "Bearer not-the-secret" } });
  expect(wrong.status()).toBe(401);
});

qa({ id: "visionworkx/social/internal-image-requires-secret", area: "Social", title: "Internal image route needs the cron secret" }, async ({ request }) => {
  const id = "00000000-0000-4000-8000-000000000000";
  expect((await request.post(`/api/internal/social-image/${id}`)).status()).toBe(401);
  const wrong = await request.post(`/api/internal/social-image/${id}`, { headers: { authorization: "Bearer not-the-secret" } });
  expect(wrong.status()).toBe(401);
});

qa({ id: "visionworkx/social/competitor-intake-cron-requires-secret", area: "Social", title: "Competitor Watch intake cron needs the cron secret" }, async ({ request }) => {
  expect((await request.get("/api/cron/social-competitor-intake")).status()).toBe(401);
  const wrong = await request.get("/api/cron/social-competitor-intake", { headers: { authorization: "Bearer not-the-secret" } });
  expect(wrong.status()).toBe(401);
});

qa({ id: "visionworkx/social/competitor-intake-import-requires-admin", area: "Social", title: "On-demand Competitor Watch import needs the admin" }, async ({ request }) => {
  expect((await request.post("/api/cron/social-competitor-intake")).status()).toBe(401);
});

qa({ id: "visionworkx/social/linkedin-feed-requires-token", area: "Social", title: "Scheduled LinkedIn feed needs its token" }, async ({ request }) => {
  expect((await request.get("/api/social/linkedin/feed")).status()).toBe(404);
  expect((await request.get("/api/social/linkedin/feed?token=not-the-token")).status()).toBe(404);
});

qa({ id: "visionworkx/social/linkedin-schedule-requires-admin", area: "Social", title: "Scheduling a LinkedIn post needs the admin" }, async ({ request }) => {
  const id = "00000000-0000-4000-8000-000000000000";
  const res = await request.patch(`/api/social/linkedin/${id}`, { data: { scheduledAt: new Date(Date.now() + 864e5).toISOString() } });
  expect(res.status()).toBe(401);
});

qa({ id: "visionworkx/social/linkedin-image-requires-admin", area: "Social", title: "LinkedIn post images need the admin" }, async ({ request }) => {
  const id = "00000000-0000-4000-8000-000000000000";
  expect((await request.post(`/api/social/linkedin/${id}/image-upload-url`, { data: { contentType: "image/png", size: 1000 } })).status()).toBe(401);
  expect((await request.get(`/api/social/linkedin/${id}/image-url`)).status()).toBe(401);
});
