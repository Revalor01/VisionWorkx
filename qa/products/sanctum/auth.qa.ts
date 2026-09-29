import { expect, qa, test } from "../../lib/qa";
import { DISCLAIMER_KEY, sanctumLogin, sanctumRows, waitUntil } from "../../lib/sanctum";

// Sanctum web app: signing in, the 18+ disclaimer, and first-time onboarding.
// (Sign-up sends an email link, so it's a manual check.)

qa({ id: "sanctum/auth/login-lands-home", area: "Sign-in & onboarding", title: "Password login lands on Home", smoke: true, mobile: true }, async ({ page, sanctumUser }) => {
  const user = await sanctumUser();
  await sanctumLogin(page, user);
  await expect(page).toHaveURL(/\/home/);
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
});

qa({ id: "sanctum/auth/disclaimer-once", area: "Sign-in & onboarding", title: "The 18+ disclaimer is shown once and remembered" }, async ({ page, sanctumUser }) => {
  const user = await sanctumUser();
  await sanctumLogin(page, user, { acceptDisclaimer: false });

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
    expect(await page.evaluate((k) => localStorage.getItem(k), DISCLAIMER_KEY)).toBe("true");
    await page.goto("/checkin");
    await expect(page.getByRole("heading", { name: "How are you feeling?" })).toBeVisible();
    await expect(page).not.toHaveURL(/disclaimer/);
  });
});

qa(
  { id: "sanctum/onboarding/complete-flow", area: "Sign-in & onboarding", title: "A new user completes onboarding and lands on Home", smoke: true },
  async ({ page, sanctumUser }) => {
    const user = await sanctumUser({ onboarded: false });
    await sanctumLogin(page, user);

    await test.step("app screens send a new user to onboarding", async () => {
      await page.goto("/home");
      await page.waitForURL(/\/onboarding/);
    });

    await test.step("focus → reminder → baseline → done", async () => {
      await page.goto("/onboarding");
      await page.getByRole("link", { name: "Begin" }).click();
      await expect(page.getByRole("heading", { name: "What are you looking for?" })).toBeVisible();
      await page.getByRole("button", { name: "Calm", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Want a gentle daily reminder?" })).toBeVisible();
      await page.getByRole("button", { name: "Not now" }).click();
      await expect(page.getByRole("heading", { name: "How are you, really?" })).toBeVisible();
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(page.getByRole("heading", { name: "You're all set." })).toBeVisible();
      await page.getByRole("button", { name: "Enter Sanctum" }).click();
      await page.waitForURL(/\/home/);
    });

    await test.step("saved: onboarding done, baseline mood, preferences", async () => {
      await waitUntil(async () => (await sanctumRows("onboarding_state", `user_id=eq.${user.id}&completed=eq.true&select=id`)).length > 0, "onboarding to be marked complete");
      const baseline = await sanctumRows<{ notes: string }>("daily_checkins", `user_id=eq.${user.id}&select=notes`);
      expect(baseline.map((b) => b.notes)).toContain("Onboarding baseline");
      const prefs = await sanctumRows<{ tone_preference: string; notification_enabled: boolean }>("preferences", `user_id=eq.${user.id}&select=tone_preference,notification_enabled`);
      expect(prefs[0]?.tone_preference).toBe("calm");
      expect(prefs[0]?.notification_enabled).toBe(false);
    });
  },
);
