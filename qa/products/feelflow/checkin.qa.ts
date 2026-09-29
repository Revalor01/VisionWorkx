import { expect, qa } from "../../lib/qa";

// FeelFlow's core loop: the kid picks a mood monster, completes the feel
// challenge, and the check-in is saved.

qa({ id: "feelflow/kid/mood-checkin", area: "Kid mode", title: "Kid picks a mood, completes the challenge, and it's saved", smoke: true, mobile: true }, async ({ page, kids }) => {
  const parent = await kids.parent();
  const kid = await kids.createKid(parent.id);
  await kids.login(page, parent);
  await kids.enterKidMode(page, kid);
  await expect(page.getByRole("heading", { name: "Pick your mood monster!" })).toBeVisible();
  // First mood monster in the grid.
  await page.locator("div.grid button").first().click();
  await page.getByRole("button", { name: /I Did It!/ }).click();
  await expect(page.getByText("Amazing work! 🌟")).toBeVisible();
  const rows = await kids.waitFor(async () => {
    const r = await kids.rows<{ mood_id: string }>("mood_checkins", `kid_id=eq.${kid.id}&select=mood_id`);
    return r.length ? r : null;
  }, "the check-in row");
  expect(rows).toHaveLength(1);
  expect(rows[0].mood_id).toBeTruthy();
});
