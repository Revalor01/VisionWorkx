import type { Page } from "@playwright/test";
import { mockChat, templateApp, waitUntil, type AppUser, type Tier } from "./templateApp";

// The Sanctum web app (https://sanctum-web-xi.vercel.app), on the shared
// consumer-app template. Tessa is Sanctum's AI companion.

const sanctum = templateApp({
  envPrefix: "SANCTUM",
  disclaimerKey: "sanctum_disclaimer_accepted",
  // redeem_code_attempts rows are made by the invalid-code test.
  nonCascading: ["daily_checkins", "emotional_journal", "redeem_code_attempts"],
});

export type SanctumTier = Tier;
export type SanctumUser = AppUser;
export const DISCLAIMER_KEY = sanctum.disclaimerKey;
export const sanctumConfigured = sanctum.configured;
export const sanctumRows = sanctum.rows;
export const createSanctumUser = sanctum.createUser;
export const deleteSanctumUser = sanctum.deleteUser;
export const sweepStaleSanctumUsers = sanctum.sweep;
export const sanctumLogin = sanctum.login;
export { waitUntil };

/** Answers Tessa's chat endpoint with a fixed reply, so no real AI call is made. */
export const mockTessa = (page: Page, reply: { reply: string; crisis?: boolean }) => mockChat(page, reply);
