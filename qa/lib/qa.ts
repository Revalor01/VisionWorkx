import { test as base, expect } from "@playwright/test";
import { createTestWorkspace, type TestWorkspace } from "./modules";

// Every QA test is declared with qa(): it gives the test a stable id (used by
// /admin/qa to pick, re-run and track it), an area heading, and tags.
//
//   qa({ id: "visionworkx/forms/embed-submit", area: "Forms", title: "…", smoke: true }, async ({ page }) => { … });
//
// Ids are "<product>/<area>/<name>", lowercase with dashes. Never reuse or
// rename an id casually -- history in /admin/qa is keyed on it.

export interface QaMeta {
  id: string;
  area: string;
  title: string;
  smoke?: boolean;
  /** Extra setup the test needs (shown as a badge), e.g. "stripe-test", "google-qa". */
  requires?: string[];
}

interface Fixtures {
  /** A throwaway VisionWorkx modules workspace (is_test, comped), deleted after the test. */
  qaWorkspace: TestWorkspace;
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  qaWorkspace: async ({}, use, testInfo) => {
    const ws = await createTestWorkspace(testInfo.testId);
    try {
      await use(ws);
    } finally {
      await ws.cleanup();
    }
  },
});

export { expect };

const ID_RE = /^[a-z0-9-]+(\/[a-z0-9-]+){2,}$/;

export function qa(meta: QaMeta, body: Parameters<typeof test>[2]) {
  if (!ID_RE.test(meta.id)) throw new Error(`Bad QA test id "${meta.id}" (want product/area/name, lowercase-dashes)`);
  test(
    meta.title,
    {
      tag: [`@${meta.id}`, ...(meta.smoke ? ["@smoke"] : [])],
      annotation: [{ type: "area", description: meta.area }, ...(meta.requires ?? []).map((r) => ({ type: "requires", description: r }))],
    },
    body,
  );
}
