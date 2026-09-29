import { expect, qa, test } from "../../lib/qa";
import { cfhLogin, deleteCfhMember, findCfhUserByEmail, qaEmail } from "../../lib/cfh";

// Christian Friends Hub — READ-ONLY tests (owner's decision): nothing is
// posted where members could see it, and volunteer forms (which email the
// real coordinators) are never submitted. Those are manual checks.

const MEMBER_PAGES = [
  { path: "/announcements", heading: "Announcements" },
  { path: "/events", heading: "Events" },
  { path: "/directory", heading: "Find a Business" },
  { path: "/prayer-requests", heading: "Prayer Requests" },
  { path: "/volunteer", heading: "Request Help / Offer Help" },
  { path: "/guidelines", heading: "Community Guidelines" },
  { path: "/contact", heading: "Contact" },
  { path: "/digital-services", heading: "Digital Services" },
  { path: "/coordination/guide", heading: "Handling Request Help & Offer Help Requests" },
];

qa({ id: "cfh/public/pages-load", area: "Public", title: "Login, sign-up and password-reset pages load", smoke: true }, async ({ page }) => {
  await test.step("login", async () => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Log In", exact: true })).toBeVisible();
  });
  await test.step("sign-up", async () => {
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Join the community hub" })).toBeVisible();
  });
  await test.step("forgot password", async () => {
    await page.goto("/forgot-password");
    await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  });
});

qa({ id: "cfh/public/signed-out-redirected", area: "Public", title: "Signed-out visitors are sent to login", smoke: true }, async ({ page }) => {
  for (const path of ["/", "/announcements", "/prayer-requests", "/admin"]) {
    await test.step(path, async () => {
      await page.goto(path);
      await page.waitForURL(/\/login/, { timeout: 10_000 });
    });
  }
});

qa({ id: "cfh/signup/wrong-access-code-refused", area: "Sign-up", title: "Sign-up with a wrong access code is refused and makes no account" }, async ({ page }) => {
  const email = qaEmail();
  try {
    await page.goto("/signup");
    await page.getByPlaceholder("Jane Smith").fill("QA Automated Test");
    await page.getByPlaceholder("you@example.com").fill(email);
    await page.getByPlaceholder("At least 8 characters").fill(`Qa!${Date.now()}long`);
    await page.getByPlaceholder("Enter the code shared with members").fill("NOT-THE-CODE");
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page.getByText("Invalid community access code.")).toBeVisible();
    expect(await findCfhUserByEmail(email), "no account was created").toBeNull();
  } finally {
    await deleteCfhMember(await findCfhUserByEmail(email), email);
  }
});

qa({ id: "cfh/member/login-lands-home", area: "Members", title: "Member login lands on the home page", smoke: true, mobile: true }, async ({ page, cfhMember }) => {
  await cfhLogin(page, await cfhMember());
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Recent Announcements" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Upcoming Events" })).toBeVisible();
});

qa({ id: "cfh/member/all-pages-load", area: "Members", title: "Every member page opens for a normal member", smoke: true, mobile: true }, async ({ page, cfhMember }) => {
  await cfhLogin(page, await cfhMember());
  for (const p of MEMBER_PAGES) {
    await test.step(p.path, async () => {
      const res = await page.goto(p.path);
      expect(res?.status(), `${p.path} status`).toBeLessThan(400);
      await expect(page).toHaveURL(new RegExp(`${p.path.replace(/\//g, "\\/")}$`));
      await expect(page.getByRole("heading", { name: p.heading }).first()).toBeVisible();
    });
  }
});

qa({ id: "cfh/access/blocked-account", area: "Safety & access", title: "A blocked account lands on 'Access Blocked'" }, async ({ page, cfhMember }) => {
  await cfhLogin(page, await cfhMember({ blocked: true }));
  await page.goto("/");
  await page.waitForURL(/\/account-blocked/);
  await expect(page.getByRole("heading", { name: "Access Blocked" })).toBeVisible();
});

qa({ id: "cfh/access/admin-refused", area: "Safety & access", title: "A normal member can't open any admin page", smoke: true }, async ({ page, cfhMember }) => {
  await cfhLogin(page, await cfhMember());
  for (const path of ["/admin", "/admin/access", "/admin/logs", "/admin/deacons"]) {
    await test.step(path, async () => {
      await page.goto(path);
      await page.waitForURL((url) => url.pathname === "/", { timeout: 10_000 });
    });
  }
});
