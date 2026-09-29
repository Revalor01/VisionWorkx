import { expect, qa } from "../../lib/qa";
import { sanctumLogin, sanctumRows, waitUntil } from "../../lib/sanctum";

// Sanctum web app: the everyday actions — checking in and journaling.

qa({ id: "sanctum/daily/check-in", area: "Daily use", title: "Logging a check-in saves the mood", smoke: true, mobile: true }, async ({ page, sanctumUser }) => {
  const user = await sanctumUser();
  await sanctumLogin(page, user);
  await page.goto("/checkin");
  await page.getByRole("button", { name: "Okay", exact: true }).click();
  await expect(page.getByText("Logged. Thanks for checking in.")).toBeVisible();
  await waitUntil(async () => (await sanctumRows("daily_checkins", `user_id=eq.${user.id}&notes=eq.Okay&mood=eq.5&select=id`)).length === 1, "the check-in row");
});

qa({ id: "sanctum/daily/journal-entry", area: "Daily use", title: "A journal entry saves and shows under Previous Entries" }, async ({ page, sanctumUser }) => {
  const user = await sanctumUser();
  await sanctumLogin(page, user);
  await page.goto("/toolkit/journal");
  const text = `QA journal entry ${Date.now().toString(36)} — a calm, ordinary day.`;
  await page.getByPlaceholder("What's on your mind?").fill(text);
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(page.getByText(text)).toBeVisible();
  await expect(page.getByText("You're not alone."), "an ordinary entry doesn't raise the crisis banner").toBeHidden();
  // Journal rows are private to their author (not readable with the admin key), so check persistence as the user.
  await page.reload();
  await expect(page.getByText(text), "the entry is still there after a reload").toBeVisible();
});
