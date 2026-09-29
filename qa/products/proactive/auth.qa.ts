import { expect, qa, test } from "../../lib/qa";
import { PROACTIVE_DISCLAIMER_KEY, proactiveLogin, proactiveRows, waitUntil } from "../../lib/proactive";

// Proactive web app: signing in, the disclaimer, and first-time onboarding.
// (Sign-up sends an email link, so it's a manual check.)

qa({ id: "proactive/auth/login-lands-home", area: "Sign-in & onboarding", title: "Password login lands on Home", smoke: true, mobile: true }, async ({ page, proactiveUser }) => {
  await proactiveLogin(page, await proactiveUser());
  await expect(page).toHaveURL(/\/home/);
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
});

qa({ id: "proactive/auth/disclaimer-once", area: "Sign-in & onboarding", title: "The disclaimer is shown once and remembered" }, async ({ page, proactiveUser }) => {
  await proactiveLogin(page, await proactiveUser(), { acceptDisclaimer: false });

  await test.step("first visit shows the disclaimer", async () => {
    await page.goto("/home");
    await page.waitForURL(/\/auth\/disclaimer/);
    const agree = page.getByRole("button", { name: /I Agree/ });
    await expect(agree, "can't agree before ticking the box").toBeDisabled();
    await page.getByRole("checkbox").check();
    await agree.click();
    await page.waitForURL(/\/home/);
  });

  await test.step("it's remembered", async () => {
    expect(await page.evaluate((k) => localStorage.getItem(k), PROACTIVE_DISCLAIMER_KEY)).toBe("true");
    await page.goto("/toolkit/temperature-check");
    await expect(page.getByRole("heading", { name: "Temperature Check" })).toBeVisible();
    await expect(page).not.toHaveURL(/disclaimer/);
  });
});

qa(
  { id: "proactive/onboarding/complete-flow", area: "Sign-in & onboarding", title: "A new user completes onboarding and lands on Home", smoke: true },
  async ({ page, proactiveUser }) => {
    const user = await proactiveUser({ onboarded: false });
    await proactiveLogin(page, user);

    await test.step("app screens send a new user to onboarding", async () => {
      await page.goto("/home");
      await page.waitForURL(/\/onboarding/);
    });

    await test.step("focus → reminder → baseline → done", async () => {
      await page.goto("/onboarding");
      await page.getByRole("link", { name: "Begin" }).click();
      await expect(page.getByRole("heading", { name: "What are you looking for?" })).toBeVisible();
      await page.getByRole("button", { name: "Clarity", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Want a gentle daily reminder?" })).toBeVisible();
      await page.getByRole("button", { name: "Not now" }).click();
      await expect(page.getByRole("heading", { name: "How are you, really?" })).toBeVisible();
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(page.getByRole("heading", { name: "You're all set." })).toBeVisible();
      await page.getByRole("button", { name: "Enter Proactive" }).click();
      await page.waitForURL(/\/home/);
    });

    await test.step("saved: onboarding done, baseline, preferences", async () => {
      await waitUntil(async () => (await proactiveRows("onboarding_state", `user_id=eq.${user.id}&completed=eq.true&select=id`)).length > 0, "onboarding to be marked complete");
      const baseline = await proactiveRows<{ notes: string }>("daily_checkins", `user_id=eq.${user.id}&select=notes`);
      expect(baseline.map((b) => b.notes)).toContain("Onboarding baseline");
      const prefs = await proactiveRows<{ tone_preference: string }>("preferences", `user_id=eq.${user.id}&select=tone_preference`);
      expect(prefs[0]?.tone_preference).toBe("clarity");
    });
  },
);
