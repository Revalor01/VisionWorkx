import { expect, qa } from "../../lib/qa";

// The /go/<code> short-link redirector. An unknown code still lands somewhere
// real (the app home) rather than a 404, and never errors.

qa({ id: "visionworkx/short-links/unknown-code-redirects", area: "Short links", title: "An unknown short link redirects instead of failing" }, async ({ request }) => {
  const res = await request.get("/go/QAqaQAq", { maxRedirects: 0 });
  expect(res.status()).toBe(302);
});
