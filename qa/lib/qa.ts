import { test as base, expect } from "@playwright/test";
import { createQaUser, createTestWorkspace, type QaUser, type TestWorkspace, type WorkspaceOptions } from "./modules";
import { createSanctumUser, deleteSanctumUser, type SanctumTier, type SanctumUser } from "./sanctum";
import { createProactiveUser, deleteProactiveUser, type ProactiveTier, type ProactiveUser } from "./proactive";
import { kidsApp, kidsProductOf, type KidsApp, type KidsParent, type KidsPlan } from "./kidsApp";

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
  /** Kids apps (Chorebit/FeelFlow/MindBit, from the project): helpers + throwaway parents, all deleted after the test. */
  kids: KidsApp & { parent: (opts?: { plan?: KidsPlan; subscription?: "active" | "trialing" | null; blocked?: boolean }) => Promise<KidsParent> };
}

// Fixtures hand their value to the test with `provide` (Playwright calls it `use`,
// which React's lint rules would mistake for a hook).
export const test = base.extend<Fixtures>({
  workspaceOptions: [{}, { option: true }],
  sanctumUser: async ({}, provide) => {
    const made: string[] = [];
    try {
      await provide(async (opts) => {
        const u = await createSanctumUser(opts);
        made.push(u.id);
        return u;
      });
    } finally {
      for (const id of made) await deleteSanctumUser(id);
    }
  },
  kids: async ({}, provide, testInfo) => {
    const app = kidsApp(kidsProductOf(testInfo.project.name));
    const made: string[] = [];
    try {
      await provide({
        ...app,
        parent: async (opts) => {
          const p = await app.createParent(opts);
          made.push(p.id);
          return p;
        },
      });
    } finally {
      for (const id of made) await app.deleteParent(id);
    }
  },
  proactiveUser: async ({}, provide) => {
    const made: string[] = [];
    try {
      await provide(async (opts) => {
        const u = await createProactiveUser(opts);
        made.push(u.id);
        return u;
      });
    } finally {
      for (const id of made) await deleteProactiveUser(id);
    }
  },
  qaUser: async ({}, provide, testInfo) => {
    const u = await createQaUser(testInfo.testId);
    try {
      await provide(u);
    } finally {
      await u.cleanup();
    }
  },
  qaWorkspace: async ({ workspaceOptions }, provide, testInfo) => {
    const ws = await createTestWorkspace(testInfo.testId, workspaceOptions);
    try {
      await provide(ws);
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
