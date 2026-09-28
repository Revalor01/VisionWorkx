import { expect, qa, test } from "../../lib/qa";
import { createModule, formConfig, modulesAdmin, NAME_FIELD, openHostPage, QA_HOST, signIn, submitViaApi, target, waitFor } from "../../lib/modules";

// Forms (lead capture / intake): building, embedding, submitting, and what the
// owner sees. No email fields here, so nothing is emailed (see emails.qa.ts).

const MESSAGE_FIELD = { id: "message", label: "How can we help?", type: "textarea", required: false, maxLength: 4000 };
// 1×1 transparent PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");

const visitorName = () => `QA Visitor ${Date.now().toString(36)}`;

qa(
  { id: "visionworkx/forms/embed-submit-dashboard", area: "Forms", title: "Embedded form submits and the owner sees it", smoke: true, mobile: true },
  async ({ page, context, qaWorkspace }) => {
    const db = modulesAdmin();
    const mod = await createModule(qaWorkspace.id, "lead_capture", formConfig([NAME_FIELD, MESSAGE_FIELD]));
    const visitor = visitorName();

    await test.step("visitor submits the embedded form", async () => {
      await openHostPage(page, mod.publicId);
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

qa(
  { id: "visionworkx/forms/builder-ai-draft-publish", area: "Forms", title: "Owner drafts a form with AI and publishes it" },
  async ({ page, context, qaWorkspace }) => {
    await signIn(context, qaWorkspace.owner);
    await page.goto(`/workspace/${qaWorkspace.slug}/modules/new`);

    await test.step("AI drafts the form from plain English", async () => {
      await page.getByLabel("What should the form ask for?").fill("Contact form for a plumber: name, email, phone, what's wrong, and a photo of the problem.");
      await page.getByRole("button", { name: "Draft my form" }).click();
      await expect(page.getByRole("heading", { name: "Your draft form" })).toBeVisible({ timeout: 60_000 });
    });

    await test.step("save & publish", async () => {
      await page.getByRole("button", { name: "Save & publish" }).click();
      const mod = await waitFor(async () => {
        const { data } = await modulesAdmin().from("vw_modules").select("status, config").eq("workspace_id", qaWorkspace.id).eq("status", "live").maybeSingle();
        return data;
      }, "the module to be live");
      const fields = ((mod.config as { fields?: { type: string }[] }).fields ?? []).map((f) => f.type);
      expect(fields, "AI-drafted fields").toContain("email");
      expect(fields.length).toBeGreaterThanOrEqual(3);
    });
  },
);

qa({ id: "visionworkx/forms/file-upload", area: "Forms", title: "Visitor attaches a photo and the owner can download it" }, async ({ page, context, qaWorkspace }) => {
  const db = modulesAdmin();
  const mod = await createModule(qaWorkspace.id, "lead_capture", formConfig([NAME_FIELD, { id: "photo", label: "Photo of the problem", type: "file", required: true }]));
  const visitor = visitorName();

  await test.step("visitor uploads and submits", async () => {
    await openHostPage(page, mod.publicId);
    const form = page.frameLocator("iframe").first();
    await form.getByLabel("Full name").fill(visitor);
    await form.locator('input[type="file"]').setInputFiles({ name: "qa-photo.png", mimeType: "image/png", buffer: PNG });
    await expect(form.getByText(/qa-photo\.png/)).toBeVisible();
    await form.getByRole("button", { name: "Send" }).click();
    await expect(form.getByText("Thanks — QA got it.")).toBeVisible();
  });

  const sub = await waitFor(async () => {
    const { data } = await db.from("vw_submissions").select("id, data").eq("workspace_id", qaWorkspace.id).maybeSingle();
    return data;
  }, "the submission row");
  const photo = (sub.data as Record<string, { name?: string; path?: string }>).photo;
  expect(photo?.name).toBe("qa-photo.png");
  expect(photo?.path, "stored file path").toBeTruthy();

  await test.step("owner downloads it", async () => {
    await signIn(context, qaWorkspace.owner);
    const res = await page.request.get(`${target()}/api/workspace/${qaWorkspace.slug}/file?submission=${sub.id}&field=photo`, { maxRedirects: 0 });
    expect(res.status(), "download redirects to a signed link").toBe(307);
    const file = await page.request.get(res.headers()["location"]);
    expect(file.ok()).toBe(true);
    expect((await file.body()).equals(PNG), "downloaded bytes match the upload").toBe(true);
  });
});

qa(
  { id: "visionworkx/forms/status-notes-export", area: "Forms", title: "Owner changes status, adds a note and exports CSV" },
  async ({ page, context, request, qaWorkspace }) => {
    const db = modulesAdmin();
    const mod = await createModule(qaWorkspace.id, "lead_capture", formConfig([NAME_FIELD]));
    const visitor = visitorName();
    const r = await submitViaApi(request, mod.publicId, { data: { name: visitor } });
    expect(r.status, JSON.stringify(r.json)).toBe(200);

    await signIn(context, qaWorkspace.owner);
    await page.goto(`/workspace/${qaWorkspace.slug}`);

    await test.step("status → Contacted", async () => {
      await page.getByLabel(`Status for ${visitor}`).selectOption("contacted");
      await waitFor(async () => {
        const { data } = await db.from("vw_submissions").select("status").eq("workspace_id", qaWorkspace.id).single();
        return data?.status === "contacted" ? data : null;
      }, "status to save");
    });

    await test.step("note saves when you click away", async () => {
      await page.getByRole("button", { name: visitor }).click();
      await page.getByLabel("Notes").fill("Called back — QA note.");
      await page.getByLabel("Notes").blur();
      await waitFor(async () => {
        const { data } = await db.from("vw_submissions").select("notes").eq("workspace_id", qaWorkspace.id).single();
        return data?.notes === "Called back — QA note." ? data : null;
      }, "note to save");
    });

    await test.step("CSV export includes it", async () => {
      const res = await page.request.get(`${target()}/api/workspace/${qaWorkspace.slug}/export`);
      expect(res.ok()).toBe(true);
      const csv = await res.text();
      expect(csv).toContain(visitor);
      expect(csv).toContain("Called back — QA note.");
    });
  },
);

qa(
  { id: "visionworkx/forms/other-sites-blocked", area: "Forms", title: "Forms only work on the business's own website" },
  async ({ request, qaWorkspace }) => {
    const mod = await createModule(qaWorkspace.id, "lead_capture", formConfig([NAME_FIELD]));

    await test.step("submitting from an unlisted site is refused", async () => {
      const r = await submitViaApi(request, mod.publicId, { data: { name: "Spammer" } }, "not-listed.revalor.test");
      expect(r.status).toBe(403);
    });

    await test.step("only the listed site may frame the form", async () => {
      const res = await request.get(`${target()}/m/${mod.publicId}`);
      const csp = res.headers()["content-security-policy"] ?? "";
      expect(csp).toContain(`frame-ancestors https://${QA_HOST}`);
      expect(csp).not.toContain("not-listed.revalor.test");
    });

    await test.step("the listed site still works", async () => {
      const r = await submitViaApi(request, mod.publicId, { data: { name: "Real visitor" } });
      expect(r.status, JSON.stringify(r.json)).toBe(200);
    });
  },
);
