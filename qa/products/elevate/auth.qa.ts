import { expect, qa, test } from "../../lib/qa";
import { ELEVATE_DISCLAIMER_KEY, elevateLogin, elevateRows, waitUntil } from "../../lib/elevate";

// Elevate web app: signing in, the disclaimer, and first-time onboarding.
// (Sign-up sends an email link, so it's a manual check.)

qa({ id: "elevate/auth/login-lands-home", area: "Sign-in & onboarding", title: "Password login lands on Home", smoke: true, mobile: true }, async ({ page, elevateUser }) => {
  await elevateLogin(page, await elevateUser());
  await expect(page).toHaveURL(/\/home/);
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
});

qa({ id: "elevate/auth/disclaimer-once", area: "Sign-in & onboarding", title: "The disclaimer is shown once and remembered" }, async ({ page, elevateUser }) => {
  await elevateLogin(page, await elevateUser(), { acceptDisclaimer: false });

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
    expect(await page.evaluate((k) => localStorage.getItem(k), ELEVATE_DISCLAIMER_KEY)).toBe("true");
    await page.goto("/retro");
    await expect(page.getByRole("heading", { name: "Your retros" })).toBeVisible();
    await expect(page).not.toHaveURL(/disclaimer/);
  });
});

qa({ id: "elevate/onboarding/complete-flow", area: "Sign-in & onboarding", title: "A new user completes onboarding and lands on Home", smoke: true }, async ({ page, elevateUser }) => {
  const user = await elevateUser({ onboarded: false });
  await elevateLogin(page, user);

  await test.step("app screens send a new user to onboarding", async () => {
    await page.goto("/home");
    await page.waitForURL(/\/onboarding/);
  });

  await test.step("intro → no finish line → reminder → done", async () => {
    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: "Your life is a system you can inspect" })).toBeVisible();
    await page.getByRole("link", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: "There's no finish line" })).toBeVisible();
    await page.getByRole("link", { name: "Next" }).click();
    await expect(page.getByRole("heading", { name: "Check back in on your experiments?" })).toBeVisible();
    await page.getByRole("button", { name: "Not now" }).click();
    await expect(page.getByRole("heading", { name: "You're all set." })).toBeVisible();
    await page.getByRole("button", { name: "Enter Elevate" }).click();
    await page.waitForURL(/\/home/);
  });

  await test.step("saved: onboarding done, reminder off", async () => {
    await waitUntil(async () => (await elevateRows("onboarding_state", `user_id=eq.${user.id}&completed=eq.true&select=user_id`)).length > 0, "onboarding to be marked complete");
    const prefs = await elevateRows<{ notification_enabled: boolean }>("preferences", `user_id=eq.${user.id}&select=notification_enabled`);
    expect(prefs[0]?.notification_enabled).toBe(false);
  });
});
