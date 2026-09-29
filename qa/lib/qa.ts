import { test as base, expect } from "@playwright/test";
import { createQaUser, createTestWorkspace, type QaUser, type TestWorkspace, type WorkspaceOptions } from "./modules";
import { createSanctumUser, deleteSanctumUser, type SanctumTier, type SanctumUser } from "./sanctum";
import { createProactiveUser, deleteProactiveUser, type ProactiveTier, type ProactiveUser } from "./proactive";

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
  /** Also run on a phone-sized screen (the "mobile" project). */
  mobile?: boolean;
  /** Extra setup the test needs (shown as a badge), e.g. "stripe-test", "google-qa". */
  requires?: string[];
}

interface Fixtures {
  /** Options for qaWorkspace; set per file with test.use({ workspaceOptions: { … } }). */
  workspaceOptions: WorkspaceOptions;
  /** A throwaway VisionWorkx modules workspace (is_test, comped), deleted after the test. */
  qaWorkspace: TestWorkspace;
  /** A signed-up user with no workspace yet, deleted (with anything they create) after the test. */
  qaUser: QaUser;
  /** Sanctum: makes throwaway users at a tier (onboarding skipped unless onboarded: false); all deleted after the test. */
  sanctumUser: (opts?: { tier?: SanctumTier; onboarded?: boolean }) => Promise<SanctumUser>;
  /** Proactive: same as sanctumUser, in Proactive's database. */
  proactiveUser: (opts?: { tier?: ProactiveTier; onboarded?: boolean }) => Promise<ProactiveUser>;
}

export const test = base.extend<Fixtures>({
  workspaceOptions: [{}, { option: true }],
  // eslint-disable-next-line no-empty-pattern
  sanctumUser: async ({}, use) => {
    const made: string[] = [];
    try {
      await use(async (opts) => {
        const u = await createSanctumUser(opts);
        made.push(u.id);
        return u;
      });
    } finally {
      for (const id of made) await deleteSanctumUser(id);
    }
  },
  // eslint-disable-next-line no-empty-pattern
  proactiveUser: async ({}, use) => {
    const made: string[] = [];
    try {
      await use(async (opts) => {
        const u = await createProactiveUser(opts);
        made.push(u.id);
        return u;
      });
    } finally {
      for (const id of made) await deleteProactiveUser(id);
    }
  },
  // eslint-disable-next-line no-empty-pattern
  qaUser: async ({}, use, testInfo) => {
    const u = await createQaUser(testInfo.testId);
    try {
      await use(u);
    } finally {
      await u.cleanup();
    }
  },
  qaWorkspace: async ({ workspaceOptions }, use, testInfo) => {
    const ws = await createTestWorkspace(testInfo.testId, workspaceOptions);
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
      tag: [`@${meta.id}`, ...(meta.smoke ? ["@smoke"] : []), ...(meta.mobile ? ["@mobile"] : [])],
      annotation: [{ type: "area", description: meta.area }, ...(meta.requires ?? []).map((r) => ({ type: "requires", description: r }))],
    },
    body,
  );
}
