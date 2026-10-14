import type { Page } from "@playwright/test";
import { mockChat, templateApp, waitUntil, type AppUser, type Tier } from "./templateApp";

// The Elevate web app (https://elevate-pink-iota.vercel.app), on the shared
// consumer-app template (cloned from Proactive). Clarity is Elevate's
// (Premium) AI; Plus unlocks Evolution's full history, export and unlimited
// experiments. Every per-user table cascades or nulls on user delete.

const elevate = templateApp({
  envPrefix: "ELEVATE",
  disclaimerKey: "elevate_disclaimer_accepted",
  nonCascading: [],
  onboardingRowFromSignup: true,
});

export type ElevateTier = Tier;
export type ElevateUser = AppUser;
export const ELEVATE_DISCLAIMER_KEY = elevate.disclaimerKey;
export const elevateConfigured = elevate.configured;
export const elevateRows = elevate.rows;
export const createElevateUser = elevate.createUser;
export const deleteElevateUser = elevate.deleteUser;
export const sweepStaleElevateUsers = elevate.sweep;
export const elevateLogin = elevate.login;
export { waitUntil };

/** Seeds active experiments straight into the database (service role skips the browser-only free limit). */
export async function seedExperiments(userId: string, count: number): Promise<void> {
  const res = await fetch(`${process.env.ELEVATE_SUPABASE_URL}/rest/v1/experiments`, {
    method: "POST",
    headers: {
      apikey: process.env.ELEVATE_SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${process.env.ELEVATE_SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(Array.from({ length: count }, (_, i) => ({ user_id: userId, description: `QA seeded experiment ${i + 1}` }))),
  });
  if (!res.ok) throw new Error(`ELEVATE seed experiments failed: HTTP ${res.status} ${await res.text()}`);
}

/** Answers Clarity's chat endpoint with a fixed reply, so no real AI call is made. */
export const mockClarity = (page: Page, reply: string) => mockChat(page, { reply });
