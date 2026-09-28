import type { APIRequestContext } from "@playwright/test";
import { expect, qa, test } from "../../lib/qa";
import { createModule, formConfig, NAME_FIELD, signIn, target } from "../../lib/modules";
import { PLAN_LIMITS } from "../../../lib/modules/plans";

// Plan limits: the module cap is enforced per plan.

async function tryCreate(request: APIRequestContext, slug: string) {
  return request.post(`${target()}/api/workspace/${slug}/modules`, {
    headers: { Origin: target(), "Content-Type": "application/json" },
    data: { name: "QA one too many", config: formConfig([NAME_FIELD]) },
  });
}

qa({ id: "visionworkx/plans/starter-module-limit", area: "Plans & billing", title: "Starter can't add more modules than its plan allows" }, async ({ page, context, qaWorkspace }) => {
  const cap = PLAN_LIMITS.starter.modules;
  for (let i = 0; i < cap; i++) await createModule(qaWorkspace.id, "lead_capture", formConfig([NAME_FIELD]), "draft");
  await signIn(context, qaWorkspace.owner);
  const res = await tryCreate(page.request, qaWorkspace.slug);
  expect(res.status()).toBe(402);
  expect(((await res.json()) as { error: string }).error).toMatch(/Upgrade on the Billing page/);
});

test.describe(() => {
  test.use({ workspaceOptions: { plan: "growth" } });
  qa({ id: "visionworkx/plans/growth-allows-more", area: "Plans & billing", title: "Growth can add modules past the Starter limit" }, async ({ page, context, qaWorkspace }) => {
    for (let i = 0; i < PLAN_LIMITS.starter.modules; i++) await createModule(qaWorkspace.id, "lead_capture", formConfig([NAME_FIELD]), "draft");
    await signIn(context, qaWorkspace.owner);
    const res = await tryCreate(page.request, qaWorkspace.slug);
    expect(res.status(), await res.text()).toBe(200);
  });
});
