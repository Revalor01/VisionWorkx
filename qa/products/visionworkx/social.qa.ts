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
