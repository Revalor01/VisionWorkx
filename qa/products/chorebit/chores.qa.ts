import { expect, qa, test } from "../../lib/qa";

// Chorebit's core loop: parent creates & assigns a chore → kid marks it done →
// parent approves → the kid's points go up. Then the kid sets a savings goal.

qa(
  { id: "chorebit/chores/earn-points", area: "Chores & points", title: "Chore assigned → kid marks it done → parent approves → points credited", smoke: true },
  async ({ page, kids }) => {
    const parent = await kids.parent();
    const kid = await kids.createKid(parent.id);
    const chore = `QA chore ${Date.now().toString(36)}`;
    await kids.login(page, parent);

    await test.step("parent creates and assigns a 15-point chore", async () => {
      await page.goto("/dashboard/chores");
      const form = page.locator("form", { has: page.locator('input[name="title"]') });
      await form.locator('input[name="title"]').fill(chore);
      await form.locator('input[name="point_value"]').fill("15");
      await form.locator('select[name="recurrence"]').selectOption("one_time");
      await form.getByLabel(kid.name).check();
      await form.getByRole("button", { name: "Create & assign" }).click();
      await kids.waitFor(async () => (await kids.rows("chore_assignments", `kid_id=eq.${kid.id}&select=id`)).length === 1, "the assignment");
    });

    await test.step("kid marks it done", async () => {
      await kids.enterKidMode(page, kid);
      await expect(page.getByRole("heading", { name: `Hi ${kid.name}!` })).toBeVisible();
      await expect(page.getByText(chore)).toBeVisible();
      await page.getByRole("button", { name: "Mark done" }).click();
      await expect(page.getByText("Waiting for approval…")).toBeVisible();
    });

    await test.step("parent approves", async () => {
      await page.goto("/dashboard/approvals");
      await expect(page.getByText(chore)).toBeVisible();
      await page.getByRole("button", { name: "Approve" }).click();
      await kids.waitFor(async () => {
        const [a] = await kids.rows<{ status: string }>("chore_assignments", `kid_id=eq.${kid.id}&select=status`);
        return a?.status === "approved";
      }, "the assignment to be approved");
    });

    await test.step("15 points credited", async () => {
      const ledger = await kids.rows<{ amount: number; reason: string }>("points_ledger", `kid_id=eq.${kid.id}&select=amount,reason`);
      expect(ledger).toEqual([{ amount: 15, reason: `Approved: ${chore}` }]);
      const [balance] = await kids.rows<{ balance: number }>("kid_point_balances", `kid_id=eq.${kid.id}&select=balance`);
      expect(balance?.balance).toBe(15);
    });
  },
);

qa({ id: "chorebit/goals/kid-sets-goal", area: "Chores & points", title: "Kid sets a savings goal" }, async ({ page, kids }) => {
  const parent = await kids.parent();
  const kid = await kids.createKid(parent.id);
  await kids.login(page, parent);
  await kids.enterKidMode(page, kid);
  const title = `QA bike ${Date.now().toString(36)}`;
  const form = page.locator("form", { has: page.locator('input[name="target_points"]') });
  await form.locator('input[name="title"]').fill(title);
  await form.locator('input[name="target_points"]').fill("100");
  const icon = form.locator('input[name="icon"]').first();
  if (await icon.count()) await icon.check({ force: true });
  await form.getByRole("button", { name: "Set goal" }).click();
  await expect(page.getByText(title)).toBeVisible();
  const goals = await kids.rows<{ title: string; target_points: number }>("goals", `kid_id=eq.${kid.id}&select=title,target_points`);
  expect(goals).toEqual([{ title, target_points: 100 }]);
});
