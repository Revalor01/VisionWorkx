import { createHmac, randomBytes } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Revalor Products site (https://products.revalorllc.com, repo revalor-products):
// the AI quiz lead magnet, its emails and the homepage promo. Its data lives in
// this repo's MAIN Supabase project (table vw_ai_quiz_leads), reached here with
// PRODUCTS_SUPABASE_URL / PRODUCTS_SUPABASE_SERVICE_ROLE_KEY.
//
// Test leads always use a Resend test inbox (delivered+aiquiz-…@resend.dev):
// emails to them go nowhere real, and revalor-products skips the call alert to
// info@revalorllc.com for @resend.dev addresses. Every test deletes its leads;
// global-setup sweeps any a crashed run left behind.

const TEST_PREFIX = "delivered+aiquiz";

function env(name: string): string {
  const v = process.env[`PRODUCTS_${name}`];
  if (!v) throw new Error(`PRODUCTS_${name} is not set (see docs/qa-suite.md)`);
  return v.replace(/[﻿\s]/g, "");
}

export function productsDbConfigured(): boolean {
  return !!(process.env.PRODUCTS_SUPABASE_URL && process.env.PRODUCTS_SUPABASE_SERVICE_ROLE_KEY);
}
export function productsCronConfigured(): boolean {
  return !!process.env.PRODUCTS_CRON_SECRET;
}
export function productsUnsubConfigured(): boolean {
  return !!process.env.PRODUCTS_UNSUB_SECRET;
}

let client: SupabaseClient | null = null;
function db(): SupabaseClient {
  client ??= createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/** A fresh Resend test address for one quiz lead. */
export function quizTestEmail(label: string): string {
  return `${TEST_PREFIX}-${label.replace(/[^a-z0-9]/gi, "").toLowerCase()}-${randomBytes(3).toString("hex")}@resend.dev`;
}

export interface QuizLead {
  id: string;
  email: string;
  first_name: string;
  source: string;
  score: number;
  level: string;
  wants_call: boolean;
  is_business_owner: boolean;
  guides_sent_at: string | null;
  nurture_step: number;
  next_email_at: string | null;
  call_alert_sent_at: string | null;
  unsubscribed_at: string | null;
  last_tip_id: string | null;
}

export async function getLead(email: string): Promise<QuizLead | null> {
  const { data, error } = await db().from("vw_ai_quiz_leads").select("*").eq("email", email).maybeSingle();
  if (error) throw new Error(`vw_ai_quiz_leads read failed: ${error.message}`);
  return data as QuizLead | null;
}

/** Inserts a finished-quiz lead directly (no form, no Email 1). */
export async function insertLead(email: string, extra: Partial<Record<string, unknown>> = {}): Promise<QuizLead> {
  const { data, error } = await db()
    .from("vw_ai_quiz_leads")
    .insert({
      first_name: "QA Tester",
      email,
      consented_at: new Date().toISOString(),
      source: "qa",
      q1_frequency: "weekly",
      q2_use: "small_business",
      q3_frustration: "vague",
      q4_used_for: ["emails"],
      q5_prompt_style: "sentence",
      q6_caught_wrong: "yes_once",
      score: 4,
      level: "builder",
      guides_sent_at: new Date().toISOString(),
      nurture_step: 1,
      ...extra,
    })
    .select("*")
    .single();
  if (error) throw new Error(`vw_ai_quiz_leads insert failed: ${error.message}`);
  return data as QuizLead;
}

export async function updateLead(email: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await db().from("vw_ai_quiz_leads").update(patch).eq("email", email);
  if (error) throw new Error(`vw_ai_quiz_leads update failed: ${error.message}`);
}

export async function deleteLead(email: string): Promise<void> {
  if (!email.startsWith(TEST_PREFIX) || !email.endsWith("@resend.dev")) throw new Error(`refusing to delete non-test lead ${email}`);
  await db().from("vw_ai_quiz_leads").delete().eq("email", email);
}

/** global-setup: remove test leads a crashed run left behind (only Resend test addresses). */
export async function sweepStaleQuizLeads(): Promise<void> {
  await db()
    .from("vw_ai_quiz_leads")
    .delete()
    .like("email", `${TEST_PREFIX}-%@resend.dev`)
    .lt("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());
}

/** Bearer header for the cron and tips routes. */
export function cronHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${env("CRON_SECRET")}` };
}

/** Same signed token revalor-products puts in unsubscribe links (lib/aiQuizUnsub.ts). */
export function unsubToken(id: string): string {
  return createHmac("sha256", env("UNSUB_SECRET")).update(`vw-ai-quiz-unsub:${id}`).digest("base64url").slice(0, 32);
}

/** The quiz answers a valid API submission needs (personal user, score 5 = builder). */
export const VALID_ANSWERS = {
  q1: "daily",
  q2: "personal",
  q3: "vague",
  q4: ["emails"],
  q5: "sentence",
  q6: "yes_once",
  q7: "",
};
