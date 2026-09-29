import { expect, qa, test } from "./qa";
import type { KidsProduct } from "./kidsApp";

// Tests every Revalor kids app shares (same template). Each product folder
// calls registerSharedKidsTests("<product>", "<App name>") once; ids come out as
// <product>/<area>/<name>, so each app tracks its own results in /admin/qa.

export function registerSharedKidsTests(product: KidsProduct, appName: string) {
  const id = (s: string) => `${product}/${s}`;

  qa({ id: id("public/pages-load"), area: "Public", title: "Home, pricing, login, privacy and terms load", smoke: true }, async ({ page }) => {
    for (const path of ["/", "/pricing", "/privacy", "/terms"]) {
      await test.step(path, async () => {
        const res = await page.goto(path);
        expect(res?.status(), `${path} status`).toBeLessThan(400);
      });
    }
    await test.step("/login", async () => {
      await page.goto("/login");
      await expect(page.getByRole("heading", { name: `Log in to ${appName}` })).toBeVisible();
    });
  });

  qa(
    { id: id("public/signed-out-redirected"), area: "Public", title: "Signed-out visitors can't reach the dashboard, profiles or kid mode", smoke: true },
    async ({ page }) => {
      for (const path of ["/dashboard", "/profiles", "/kid"]) {
        await test.step(path, async () => {
          await page.goto(path);
          await page.waitForURL(/\/login/, { timeout: 10_000 });
        });
      }
    },
  );

  qa({ id: id("parent/login-lands-dashboard"), area: "Parents", title: "Parent login lands on the dashboard", smoke: true, mobile: true }, async ({ page, kids }) => {
    await kids.login(page, await kids.parent());
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  });

  qa({ id: id("parent/no-plan-goes-to-start"), area: "Parents", title: "A parent without a plan is sent to choose one" }, async ({ page, kids }) => {
    await kids.login(page, await kids.parent({ subscription: null }));
    await page.goto("/dashboard");
    await page.waitForURL(/\/start/);
  });

  qa({ id: id("kids/add-kid-with-pin"), area: "Kids", title: "Parent adds a kid with a PIN", smoke: true }, async ({ page, kids }) => {
    const parent = await kids.parent();
    await kids.login(page, parent);
    await page.goto(kids.cfg.kidsPath);
    const name = `QA Kid ${Date.now().toString(36)}`;
    await page.getByRole("button", { name: "+ Add a kid" }).click();
    const form = page.locator("form", { has: page.locator('input[name="name"]') });
    await form.locator('input[name="name"]').fill(name);
    const avatar = form.locator('input[name="avatar"]').first();
    if (await avatar.count()) await avatar.check({ force: true });
    await form.locator('input[name="pin"]').fill("4321");
    await form.locator('button[type="submit"]').click();
    await expect(page.getByText(name).first()).toBeVisible();
    const rows = await kids.waitFor(async () => {
      const r = await kids.rows<{ name: string; pin: string | null }>("kids", `parent_id=eq.${parent.id}&select=name,pin`);
      return r.length ? r : null;
    }, "the kid row");
    expect(rows[0]).toEqual({ name, pin: "4321" });
  });

  qa({ id: id("kids/kid-mode-pin"), area: "Kids", title: "Kid mode refuses a wrong PIN and opens with the right one", mobile: true }, async ({ page, kids }) => {
    const parent = await kids.parent();
    const kid = await kids.createKid(parent.id, { pin: "2468" });
    await kids.login(page, parent);
    await test.step("wrong PIN", async () => {
      await kids.enterKidMode(page, kid, "1111");
      await expect(page.getByText("Incorrect PIN.")).toBeVisible();
      await expect(page).toHaveURL(/\/profiles/);
    });
    await test.step("right PIN", async () => {
      await page.getByPlaceholder("PIN").fill("2468");
      await page.getByRole("button", { name: "Go" }).click();
      await page.waitForURL(/\/kid/);
    });
  });

  qa({ id: id("plans/free-kid-limit"), area: "Plans", title: "The Free plan can't add a second kid" }, async ({ page, kids }) => {
    const parent = await kids.parent({ plan: "free" });
    await kids.createKid(parent.id);
    await kids.login(page, parent);
    await page.goto(kids.cfg.kidsPath);
    await page.getByRole("button", { name: "+ Add a kid" }).click();
    const form = page.locator("form", { has: page.locator('input[name="name"]') });
    await form.locator('input[name="name"]').fill("QA One Too Many");
    const avatar = form.locator('input[name="avatar"]').first();
    if (await avatar.count()) await avatar.check({ force: true });
    await form.locator('button[type="submit"]').click();
    await expect(page.getByText(/plan allows up to 1 kid/)).toBeVisible();
    expect(await kids.rows("kids", `parent_id=eq.${parent.id}&select=id`)).toHaveLength(1);
  });

  qa({ id: id("account/blocked"), area: "Account", title: "A blocked account lands on the 'Account paused' page" }, async ({ page, kids }) => {
    await kids.login(page, await kids.parent({ blocked: true }));
    await page.goto("/dashboard");
    await page.waitForURL(/\/account-blocked/);
    await expect(page.getByRole("heading", { name: "Account paused" })).toBeVisible();
  });

  qa({ id: id("admin/non-admin-refused"), area: "Account", title: "Parents can't open the admin page", smoke: true }, async ({ page, kids }) => {
    await kids.login(page, await kids.parent());
    await page.goto("/admin");
    await page.waitForURL(/\/dashboard/);
  });
}
