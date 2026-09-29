import { expect, qa } from "../../lib/qa";

// MindBit's core loop: the kid plays a self-control game and the session is
// saved. The Wait Game is used because it doesn't depend on reaction timing.
// The parent quiz is checked for loading only -- submitting it emails the
// operator a lead alert, so that stays a manual check.

qa({ id: "mindbit/kid/wait-game", area: "Kid mode", title: "Kid plays The Wait Game and the session is saved", smoke: true, mobile: true }, async ({ page, kids }) => {
  const parent = await kids.parent();
  const kid = await kids.createKid(parent.id);
  await kids.login(page, parent);
  await kids.enterKidMode(page, kid);
  // The game tile's text includes its description.
  await page.getByRole("button", { name: /gem grows bigger/ }).click();
  await page.getByRole("button", { name: /Start the gem growing/ }).click();
  await page.waitForTimeout(2_000);
  await page.getByRole("button", { name: /Tap to collect/ }).click();
  const rows = await kids.waitFor(async () => {
    const r = await kids.rows<{ game: string; xp_earned?: number }>("game_sessions", `kid_id=eq.${kid.id}&select=game`);
    return r.length ? r : null;
  }, "the game session");
  expect(rows).toEqual([{ game: "wait_game" }]);
});

qa({ id: "mindbit/quiz/page-loads", area: "Public", title: "The parent quiz page loads" }, async ({ page }) => {
  const res = await page.goto("/quiz");
  expect(res?.status()).toBeLessThan(400);
  await expect(page.getByRole("heading").first()).toBeVisible();
});
