import { expect, qa, test } from "../../lib/qa";
import { sanctumLogin, sanctumRows, waitUntil } from "../../lib/sanctum";

// Sanctum web app: account settings. Phone numbers are fictional 555-01xx numbers.

qa({ id: "sanctum/account/emergency-contact", area: "Account", title: "Add and remove an emergency contact" }, async ({ page, sanctumUser }) => {
  const user = await sanctumUser();
  await sanctumLogin(page, user);
  await page.goto("/account/emergency-contacts");
  const name = `QA Contact ${Date.now().toString(36)}`;

  await test.step("add", async () => {
    await page.getByRole("button", { name: "+ Add Emergency Contact" }).click();
    await page.getByPlaceholder("Full name").fill(name);
    await page.getByPlaceholder("+1 (555) 000-0000").fill("+1 555 555 0101");
    await page.getByRole("button", { name: "Friend", exact: true }).click();
    await page.getByRole("button", { name: "Save Contact" }).click();
    await expect(page.getByText(name)).toBeVisible();
    await waitUntil(async () => (await sanctumRows("emergency_contacts", `user_id=eq.${user.id}&select=id`)).length === 1, "the contact row");
  });

  await test.step("remove", async () => {
    // The app confirms with a browser dialog ("Remove … from your emergency contacts?").
    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Remove" }).first().click();
    await expect(page.getByText(name)).toBeHidden();
    await waitUntil(async () => (await sanctumRows("emergency_contacts", `user_id=eq.${user.id}&select=id`)).length === 0, "the contact to be deleted");
  });
});

qa({ id: "sanctum/account/sms-opt-in", area: "Account", title: "SMS updates need consent, save, and can be turned off" }, async ({ page, sanctumUser }) => {
  const user = await sanctumUser();
  await sanctumLogin(page, user);
  await page.goto("/account/notifications");
  const optIn = page.getByRole("button", { name: "Opt in to SMS updates" });

  await test.step("can't opt in without ticking consent", async () => {
    await page.getByPlaceholder("+1 (555) 123-4567").fill("+1 555 555 0102");
    await expect(optIn).toBeDisabled();
  });

  await test.step("opt in", async () => {
    await page.getByRole("checkbox", { name: /I agree to receive SMS text messages/ }).check();
    await optIn.click();
    const on = page.getByText("SMS updates on");
    const appError = page.locator("p.text-error-base");
    await expect(on.or(appError)).toBeVisible();
    if (await appError.isVisible()) throw new Error(`The app refused the opt-in: "${await appError.innerText()}"`);
    const rows = await sanctumRows<{ phone: string }>("sms_opt_ins", `user_id=eq.${user.id}&select=phone`);
    expect(rows).toHaveLength(1);
  });

  await test.step("turn off", async () => {
    await page.getByRole("button", { name: "Turn off" }).click();
    await expect(optIn).toBeVisible();
    await waitUntil(async () => (await sanctumRows("sms_opt_ins", `user_id=eq.${user.id}&select=id`)).length === 0, "the opt-in to be removed");
  });
});

qa({ id: "sanctum/account/edit-profile", area: "Account", title: "Display name saves" }, async ({ page, sanctumUser }) => {
  const user = await sanctumUser();
  await sanctumLogin(page, user);
  // The page fills the form from users_profile after it renders; anything typed before that
  // read finishes is overwritten (display name reset to ""), so wait for the read first.
  const profileLoaded = page.waitForResponse((r) => r.url().includes("/rest/v1/users_profile") && r.url().includes("display_name") && r.request().method() === "GET");
  await page.goto("/account/edit-profile");
  await profileLoaded;
  const displayName = `QA ${Date.now().toString(36)}`;
  const field = page.locator("label", { hasText: "Display name" }).locator("xpath=following-sibling::input[1]");
  await field.fill(displayName);
  // The page shows "Saved" even when nothing was written, so check the write itself.
  const write = page.waitForResponse((r) => r.url().includes("/rest/v1/users_profile") && r.request().method() === "PATCH", { timeout: 10_000 });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const res = await write.catch(() => null);
  expect(res, "Save sent no update to users_profile").not.toBeNull();
  expect(res!.request().postData() ?? "", "the update carried the typed name").toContain(displayName);
  expect(res!.status(), `update answered ${res!.status()}`).toBeLessThan(300);
  await expect(page.getByRole("button", { name: /Saved/ })).toBeVisible();
  const [profile] = await sanctumRows<{ display_name: string }>("users_profile", `id=eq.${user.id}&select=display_name`);
  expect(profile.display_name).toBe(displayName);
});
