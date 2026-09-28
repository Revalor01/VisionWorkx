import { expect, qa, test } from "../../lib/qa";
import { modulesAdmin, QA_HOST, resendTestAddress, signIn, waitFor } from "../../lib/modules";

// Signup: a new account sets up its workspace. (The /start email-link step
// can't be automated without a real inbox; it's a manual check. QA accounts
// get no welcome email and don't alert the operator.)

qa(
  { id: "visionworkx/signup/onboarding-creates-workspace", area: "Signup", title: "New account sets up a workspace and lands on Billing", smoke: true },
  async ({ page, context, qaUser }) => {
    await signIn(context, qaUser);
    await page.goto("/workspace/onboarding");

    await test.step("fill in the business details", async () => {
      await page.getByLabel("Business name").fill("QA Plumbing Co");
      await page.getByLabel(/Website your forms will go on/).fill(QA_HOST);
      await page.getByLabel("Send new-lead alerts to").fill(resendTestAddress("qaonboarding"));
      const terms = page.getByRole("checkbox");
      if (await terms.count()) await terms.check();
      await page.getByRole("button", { name: "Create workspace & continue" }).click();
    });

    await test.step("lands on Billing to start the trial", async () => {
      await expect(page).toHaveURL(/\/workspace\/[a-z0-9-]+\/billing\?welcome=1/);
    });

    await test.step("workspace is set up correctly", async () => {
      const ws = await waitFor(async () => {
        const { data } = await modulesAdmin()
          .from("vw_workspaces")
          .select("name, domains, plan, billing_status, self_serve, is_test")
          .eq("created_by", qaUser.id)
          .maybeSingle();
        return data;
      }, "the workspace row");
      expect(ws.name).toBe("QA Plumbing Co");
      expect(ws.domains).toEqual([QA_HOST]);
      expect(ws.plan).toBe("starter");
      expect(ws.billing_status, "no plan until the trial starts").toBe("none");
      expect(ws.self_serve).toBe(true);
      expect(ws.is_test, "QA accounts' workspaces are marked as test data").toBe(true);
    });
  },
);
