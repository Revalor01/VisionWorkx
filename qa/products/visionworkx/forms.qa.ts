import { expect, qa, test } from "../../lib/qa";
import { modulesAdmin, openHostPage, signIn, waitFor } from "../../lib/modules";

// Forms: a live form embedded on a customer's site, submitted by a visitor,
// shows up for the owner. (No email field, so no real emails are sent.)

const FORM_CONFIG = {
  title: "QA contact form",
  intro: "Automated test form.",
  submitLabel: "Send",
  successMessage: "Thanks — QA got it.",
  redirectUrl: null,
  style: {},
  fields: [
    { id: "name", label: "Full name", type: "text", required: true, maxLength: 120 },
    { id: "message", label: "How can we help?", type: "textarea", required: false, maxLength: 4000 },
  ],
  payment: null,
};

qa(
  {
    id: "visionworkx/forms/embed-submit-dashboard",
    area: "Forms",
    title: "Embedded form submits and the owner sees it",
    smoke: true,
  },
  async ({ page, context, qaWorkspace }) => {
    const db = modulesAdmin();
    const { data: mod, error } = await db
      .from("vw_modules")
      .insert({ workspace_id: qaWorkspace.id, type: "lead_capture", name: "QA form", config: FORM_CONFIG, status: "live" })
      .select("id, public_id")
      .single();
    expect(error, "create module").toBeNull();

    const visitor = `QA Visitor ${Date.now().toString(36)}`;
    await test.step("visitor submits the embedded form", async () => {
      await openHostPage(page, mod!.public_id);
      const form = page.frameLocator("iframe").first();
      await form.getByLabel("Full name").fill(visitor);
      await form.getByLabel("How can we help?").fill("Automated QA submission — safe to ignore.");
      await form.getByRole("button", { name: "Send" }).click();
      await expect(form.getByText("Thanks — QA got it.")).toBeVisible();
    });

    await test.step("submission is stored", async () => {
      const sub = await waitFor(async () => {
        const { data } = await db.from("vw_submissions").select("id, data, status").eq("workspace_id", qaWorkspace.id).maybeSingle();
        return data;
      }, "the submission row");
      expect((sub.data as Record<string, unknown>).name).toBe(visitor);
      expect(sub.status).toBe("new");
    });

    await test.step("owner sees it in the dashboard", async () => {
      await signIn(context, qaWorkspace.owner);
      await page.goto(`/workspace/${qaWorkspace.slug}`);
      await expect(page.getByText(visitor).first()).toBeVisible();
    });
  },
);
