import { expect, qa, test } from "../../lib/qa";
import { elevateLogin, elevateRows, seedExperiments, waitUntil } from "../../lib/elevate";

// Elevate web app: the core loop — a retro (steps 1-5 autosave), an
// experiment (step 6), the free plan's active-experiment limit, and Playbook.

const ANSWERS = [
  "QA: the meeting ran over and I cut someone off.",
  "QA: felt rushed, spoke too fast.",
  "QA: I apologised straight after.",
  "QA: I didn't pause before replying.",
  "QA: I rush when a meeting runs long.",
];

async function startRetro(page: import("@playwright/test").Page, title: string) {
  await page.goto("/retro/new");
  await expect(page.getByRole("heading", { name: "Something happened" })).toBeVisible();
  await page.getByPlaceholder("e.g. Snapped at Sam in stand-up").fill(title);
  await page.getByPlaceholder("e.g. work, conflict").fill("qa, work");
  await page.getByRole("button", { name: /Start the retro/ }).click();
  await page.waitForURL(/\/retro\/[0-9a-f-]{36}/);
  return page.url().split("/retro/")[1];
}

qa({ id: "elevate/retro/full-retro-with-experiment", area: "Retros", title: "A retro goes through all six steps and saves an experiment", smoke: true, mobile: true }, async ({ page, elevateUser }) => {
  const user = await elevateUser({ tier: "free" });
  await elevateLogin(page, user);
  const title = `QA retro ${Date.now().toString(36)}`;
  const retroId = await startRetro(page, title);

  await test.step("steps 1-5", async () => {
    for (const [i, text] of ANSWERS.entries()) {
      await expect(page.getByText(`Step ${i + 1} of 6`)).toBeVisible();
      await page.getByPlaceholder("Write it in your own words…").fill(text);
      await page.getByRole("button", { name: "Next", exact: true }).click();
    }
  });

  await test.step("step 6: the experiment", async () => {
    await expect(page.getByText("Step 6 of 6")).toBeVisible();
    await page.getByPlaceholder("e.g. When a meeting runs over, pause 5 seconds before replying").fill("QA: pause 5 seconds before replying");
    await page.getByPlaceholder("e.g. Monday stand-ups with Sam").fill("QA: long meetings");
    await page.getByRole("button", { name: "Finish retro" }).click();
    await expect(page.getByText("Retro complete")).toBeVisible();
  });

  await test.step("saved: answers, complete, one experiment", async () => {
    const [retro] = await elevateRows<Record<string, string>>("retros", `id=eq.${retroId}&select=status,situation_title,step1_happened,step5_learned`);
    expect(retro).toMatchObject({ status: "complete", situation_title: title, step1_happened: ANSWERS[0], step5_learned: ANSWERS[4] });
    const exps = await elevateRows<{ description: string; state: string; followup_due_at: string | null }>("experiments", `retro_id=eq.${retroId}&select=description,state,followup_due_at`);
    expect(exps).toHaveLength(1);
    expect(exps[0]).toMatchObject({ description: "QA: pause 5 seconds before replying", state: "intention" });
    expect(exps[0].followup_due_at, "a follow-up date is set").not.toBeNull();
  });
});

qa({ id: "elevate/retro/autosave-resume", area: "Retros", title: "Retro answers autosave, and a reopened retro resumes where you left off" }, async ({ page, elevateUser }) => {
  await elevateLogin(page, await elevateUser());
  const retroId = await startRetro(page, `QA autosave ${Date.now().toString(36)}`);
  const text = `QA autosave ${Date.now().toString(36)}`;
  await page.getByPlaceholder("Write it in your own words…").fill(text);
  await waitUntil(async () => (await elevateRows<{ step1_happened: string | null }>("retros", `id=eq.${retroId}&select=step1_happened`))[0]?.step1_happened === text, "the autosave");
  await page.reload();
  // A reopened retro resumes at the first empty step.
  await expect(page.getByText("Step 2 of 6")).toBeVisible();
  await page.getByRole("button", { name: /^Step 1:/ }).click();
  await expect(page.getByPlaceholder("Write it in your own words…")).toHaveValue(text);
});

qa({ id: "elevate/retro/free-experiment-limit", area: "Retros", title: "Free is stopped at 3 active experiments; Plus is not" }, async ({ page, elevateUser }) => {
  for (const tier of ["free", "plus"] as const) {
    await test.step(tier, async () => {
      await page.context().clearCookies();
      const user = await elevateUser({ tier });
      await seedExperiments(user.id, 3);
      await elevateLogin(page, user);
      const retroId = await startRetro(page, `QA limit ${tier}`);
      await page.getByRole("button", { name: /^Step 6:/ }).click();
      await page.getByPlaceholder("e.g. When a meeting runs over, pause 5 seconds before replying").fill(`QA fourth experiment (${tier})`);
      await page.getByRole("button", { name: "Finish retro" }).click();
      if (tier === "free") {
        await expect(page.getByText(/The free plan allows 3 active experiments/)).toBeVisible();
        expect(await elevateRows("experiments", `retro_id=eq.${retroId}&select=id`)).toHaveLength(0);
      } else {
        await expect(page.getByText("Retro complete")).toBeVisible();
        expect(await elevateRows("experiments", `retro_id=eq.${retroId}&select=id`)).toHaveLength(1);
      }
    });
  }
});

qa({ id: "elevate/playbook/add-item", area: "Playbook", title: "A Playbook item saves and is still there after a reload" }, async ({ page, elevateUser }) => {
  const user = await elevateUser();
  await elevateLogin(page, user);
  await page.goto("/playbook");
  await expect(page.getByRole("heading", { name: "Playbook" })).toBeVisible();
  const text = `QA: take a breath first ${Date.now().toString(36)}`;
  await page.getByPlaceholder("Add something that works for you…").fill(text);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(text)).toBeVisible();
  await waitUntil(async () => (await elevateRows("playbook_items", `user_id=eq.${user.id}&source=eq.manual&select=id`)).length === 1, "the playbook row");
  await page.reload();
  await expect(page.getByText(text)).toBeVisible();
});
