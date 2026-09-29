import type { Page } from "@playwright/test";
import { mockChat, templateApp, waitUntil, type AppUser, type Tier } from "./templateApp";

// The Proactive web app (https://proactive-zeta-three.vercel.app), on the
// shared consumer-app template. Collaborator is Proactive's (Premium) AI;
// "Entry" is its name for the plus tier.

const proactive = templateApp({
  envPrefix: "PROACTIVE",
  disclaimerKey: "proactive_disclaimer_accepted",
  nonCascading: ["daily_checkins", "emotional_journal", "redeem_code_attempts"],
});

export type ProactiveTier = Tier;
export type ProactiveUser = AppUser;
export const PROACTIVE_DISCLAIMER_KEY = proactive.disclaimerKey;
export const proactiveConfigured = proactive.configured;
export const proactiveRows = proactive.rows;
export const createProactiveUser = proactive.createUser;
export const deleteProactiveUser = proactive.deleteUser;
export const sweepStaleProactiveUsers = proactive.sweep;
export const proactiveLogin = proactive.login;
export { waitUntil };

/** Answers Collaborator's chat endpoint with a fixed reply, so no real AI call is made. */
export const mockCollaborator = (page: Page, reply: string) => mockChat(page, { reply });
