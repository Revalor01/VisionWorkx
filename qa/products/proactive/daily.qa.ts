import { expect, qa } from "../../lib/qa";
import { proactiveLogin, proactiveRows, waitUntil } from "../../lib/proactive";

// Proactive web app: Temperature Check and the journal.

qa({ id: "proactive/daily/temperature-check", area: "Daily use", title: "Temperature Check logs a check-in", smoke: true, mobile: true }, async ({ page, proactiveUser }) => {
  const user = await proactiveUser();
  await proactiveLogin(page, user);
  await page.goto("/toolkit/temperature-check");
  await page.getByRole("button", { name: /Calm/ }).click();
  await page.getByPlaceholder("Notes (optional)").fill("QA check-in");
  await page.getByRole("button", { name: "Log check-in" }).click();
  await expect(page.getByRole("button", { name: /Saved/ })).toBeVisible();
  await waitUntil(
    async () => (await proactiveRows<{ notes: string }>("daily_checkins", `user_id=eq.${user.id}&select=notes`)).some((r) => r.notes.startsWith("Calm")),
    "the check-in row",
  );
});

qa({ id: "proactive/daily/journal-entry", area: "Daily use", title: "A journal entry saves and is still there after a reload" }, async ({ page, proactiveUser }) => {
  await proactiveLogin(page, await proactiveUser());
  await page.goto("/toolkit/journal");
  const text = `QA journal entry ${Date.now().toString(36)} — weighing two options.`;
  await page.getByPlaceholder("What's on your mind?").fill(text);
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(page.getByText(text)).toBeVisible();
  // Journal rows are private to their author, so check persistence as the user.
  await page.reload();
  await expect(page.getByText(text)).toBeVisible();
});
