import { expect, qa } from "../../lib/qa";
import { sanctumLogin } from "../../lib/sanctum";

// Sanctum web app: the admin page is only for the operator.

qa({ id: "sanctum/admin/non-admin-refused", area: "Admin", title: "Non-admin accounts can't open the admin page", smoke: true }, async ({ page, sanctumUser }) => {
  await sanctumLogin(page, await sanctumUser({ tier: "premium" }));
  await page.goto("/admin");
  await page.waitForURL(/\/home/);
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
});
