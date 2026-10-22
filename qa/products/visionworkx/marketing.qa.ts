import { expect, qa } from "../../lib/qa";

// VisionWorkx Email Marketing (/admin/marketing). Black-box: the QA runner has
// no admin session, so this checks the routes that send or change a campaign
// stay admin-only. (Approve & send's preview, confirm and double-send guard
// sit behind that admin check.)

const ID = "00000000-0000-4000-8000-000000000000";

qa({ id: "visionworkx/marketing/approve-requires-admin", area: "Email Marketing", title: "Approving a campaign needs the admin" }, async ({ request }) => {
  expect((await request.post(`/api/admin/marketing/campaigns/${ID}/approve`)).status()).toBe(401);
});

qa({ id: "visionworkx/marketing/send-requires-admin", area: "Email Marketing", title: "Sending a campaign needs the admin" }, async ({ request }) => {
  expect((await request.post(`/api/admin/marketing/campaigns/${ID}/send`, { data: {} })).status()).toBe(401);
});

qa({ id: "visionworkx/marketing/cancel-requires-admin", area: "Email Marketing", title: "Cancelling a campaign needs the admin" }, async ({ request }) => {
  expect((await request.post(`/api/admin/marketing/campaigns/${ID}/cancel`)).status()).toBe(401);
});
