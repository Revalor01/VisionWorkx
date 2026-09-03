// Phase 5b: instant preview / reverse trial. A preview is an apps row with
// user_id null and preview_* set. It generates + deploys through the normal
// pipeline; claiming assigns user_id and clears the preview fields.

import { randomBytes } from "crypto";
import { createServiceClient } from "@/lib/supabase";
import type { AppCategory, IntakeData } from "@/lib/database.types";

export const PREVIEW_TTL_HOURS = 72;

function appOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://vision-workx.vercel.app";
}

export function newPreviewToken(): string {
  return randomBytes(24).toString("hex");
}

const CATEGORY_LABEL: Record<AppCategory, string> = {
  booking: "Booking App",
  crm: "CRM",
  inventory: "Inventory App",
  portal: "Customer Portal",
  invoicing: "Invoicing App",
  membership: "Membership App",
};

export interface CreatePreviewResult {
  id: string;
  token: string;
  /** true when an un-claimed preview for this email already existed. */
  resumed: boolean;
}

/**
 * Create a preview app (or return the caller's existing un-claimed one) and
 * return its token. Does not start generation — the caller triggers that.
 */
export async function createPreviewApp(
  email: string,
  intake: IntakeData,
): Promise<CreatePreviewResult> {
  const service = createServiceClient();
  const norm = email.trim().toLowerCase();

  const { data: existing } = await service
    .from("apps")
    .select("id, preview_token, status")
    .eq("preview_email", norm)
    .is("claimed_at", null)
    .maybeSingle();
  if (existing?.preview_token) {
    return { id: existing.id, token: existing.preview_token, resumed: true };
  }

  const token = newPreviewToken();
  const name = `${intake.businessName} ${CATEGORY_LABEL[intake.category] ?? intake.category}`;
  const { data: app, error } = await service
    .from("apps")
    .insert({
      user_id: null,
      name,
      category: intake.category,
      status: "generating",
      intake_data: intake,
      preview_token: token,
      preview_email: norm,
      preview_expires_at: new Date(Date.now() + PREVIEW_TTL_HOURS * 3600_000).toISOString(),
    })
    .select("id")
    .single();
  if (error || !app) throw new Error(error?.message ?? "could not create preview");

  return { id: app.id, token, resumed: false };
}

/**
 * Run the normal generation pipeline for a preview (service-bearer). This
 * awaits /api/generate's non-streaming preview path — call it inside the
 * caller's `after()` so the function stays alive until it finishes.
 */
export async function runPreviewGenerate(appId: string): Promise<void> {
  try {
    const res = await fetch(`${appOrigin()}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
      },
      body: JSON.stringify({ appId, _preview: true }),
    });
    if (!res.ok) {
      console.error(`[preview] generate returned ${res.status} for ${appId}`);
    }
  } catch (err) {
    console.error("[preview] generate failed:", err);
  }
}

export interface PreviewView {
  id: string;
  name: string;
  status: string;
  deployUrl: string | null;
  expiresAt: string | null;
  claimed: boolean;
  email: string | null;
}

export async function getPreviewByToken(token: string): Promise<PreviewView | null> {
  const { data } = await createServiceClient()
    .from("apps")
    .select("id, name, status, deploy_url, preview_expires_at, claimed_at, preview_email")
    .eq("preview_token", token)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    status: data.status,
    deployUrl: data.deploy_url,
    expiresAt: data.preview_expires_at,
    claimed: data.claimed_at != null,
    email: data.preview_email,
  };
}

export interface ClaimResult {
  ok: boolean;
  appId?: string;
  error?: string;
}

/** Assign a signed-up user as the owner of a preview and clear preview state. */
export async function claimPreview(token: string, userId: string): Promise<ClaimResult> {
  const service = createServiceClient();
  const { data: app } = await service
    .from("apps")
    .select("id, claimed_at, preview_expires_at")
    .eq("preview_token", token)
    .maybeSingle();
  if (!app) return { ok: false, error: "That preview link is no longer valid." };
  if (app.claimed_at) return { ok: false, error: "This app has already been claimed." };
  if (app.preview_expires_at && new Date(app.preview_expires_at) < new Date()) {
    return { ok: false, error: "This preview expired. Start a new one." };
  }

  const { error } = await service
    .from("apps")
    .update({
      user_id: userId,
      claimed_at: new Date().toISOString(),
      preview_token: null,
      preview_email: null,
      preview_expires_at: null,
    })
    .eq("id", app.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, appId: app.id };
}
