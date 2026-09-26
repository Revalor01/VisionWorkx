import { after, NextRequest } from "next/server";
import { getModuleByPublicId } from "@/lib/modules/data";
import { validateSubmission, type FileValue } from "@/lib/modules/config";
import { modulesConfigured, modulesServiceClient } from "@/lib/modules/supabase";
import { corsHeaders, ipHash, json, originAllowed } from "@/lib/modules/http";
import { sendWebhook } from "@/lib/modules/webhook";
import { UPLOAD_BUCKET } from "@/lib/modules/constants";
import { billingAllowsService, gateSubmission, limitsFor } from "@/lib/modules/plans";
import { sendUsageAlert, submissionsThisMonth } from "@/lib/modules/usage";
import { NextResponse } from "next/server";

// Public: visitors on client websites submit module forms here.
// Order matters — cheap checks first, database last:
//   size -> JSON -> honeypot -> module lookup -> origin -> rate limit -> validate -> store.

export const runtime = "nodejs";
const MAX_BYTES = 16 * 1024;
const HONEYPOT = "vw_hp";

export async function OPTIONS(req: NextRequest, props: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await props.params;
  if (!modulesConfigured()) return new NextResponse(null, { status: 204 });
  const mod = await getModuleByPublicId(moduleId);
  return new NextResponse(null, { status: 204, headers: corsHeaders(req, mod?.domains ?? []) });
}

export async function POST(req: NextRequest, props: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await props.params;
  if (!modulesConfigured()) return NextResponse.json({ error: "Modules aren't set up yet." }, { status: 503 });

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) return NextResponse.json({ error: "Too large." }, { status: 413 });
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return NextResponse.json({ error: "Too large." }, { status: 413 });

  let body: { data?: unknown; source_url?: unknown; [HONEYPOT]?: unknown };
  try {
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const mod = await getModuleByPublicId(moduleId);
  if (!mod || mod.status !== "live" || !billingAllowsService(mod.billingStatus)) {
    return NextResponse.json({ error: "This form isn't available." }, { status: 404 });
  }
  const domains = mod.domains;
  const alertWs = { id: mod.workspaceId, name: mod.workspaceName, slug: mod.workspaceSlug, plan: mod.plan, notification_email: mod.notificationEmail };

  if (!originAllowed(req, domains)) {
    return json(req, domains, { error: "This form can't be used from this website." }, 403);
  }

  // Honeypot filled: pretend it worked, store nothing.
  if (typeof body[HONEYPOT] === "string" && body[HONEYPOT] !== "") {
    return json(req, domains, { ok: true, message: mod.config.successMessage, redirectUrl: mod.config.redirectUrl });
  }

  const db = modulesServiceClient();
  const ip = ipHash(req);
  const [perIp, perModule] = await Promise.all([
    db.rpc("vw_rate_check", { p_key: `sub:${mod.publicId}:${ip}`, max_hits: 8, window_seconds: 600 }),
    db.rpc("vw_rate_check", { p_key: `sub:${mod.publicId}`, max_hits: 300, window_seconds: 3600 }),
  ]);
  if (perIp.data === false || perModule.data === false) {
    return json(req, domains, { error: "Too many submissions — please try again in a few minutes." }, 429, {
      "Retry-After": "600",
    });
  }

  // Plan soft limit: warn at 80%/100%, keep saving to 150%, then pause the form.
  const gate = gateSubmission(await submissionsThisMonth(mod.workspaceId), limitsFor(mod.plan).submissionsPerMonth);
  if (!gate.allow) {
    after(() => sendUsageAlert(alertWs, "submissions_150"));
    return json(req, domains, { error: "This form is temporarily unavailable. Please contact the business directly." }, 503);
  }

  const result = validateSubmission(mod.config, body.data, mod.id);
  if (!result.ok) return json(req, domains, { error: "Please fix the highlighted fields.", fields: result.errors }, 400);

  // Each attached file must really exist in storage, under this module, with
  // the size/type the visitor claimed (storage enforces the 10 MB / type limits too).
  for (const f of mod.config.fields.filter((x) => x.type === "file")) {
    const fv = result.values[f.id] as FileValue | undefined;
    if (!fv) continue;
    const { data: info, error: infoErr } = await db.storage.from(UPLOAD_BUCKET).info(fv.path);
    if (infoErr || !info) {
      return json(req, domains, { error: "Please fix the highlighted fields.", fields: { [f.id]: `${f.label}: the upload didn't finish — attach it again.` } }, 400);
    }
    const realSize = typeof info.size === "number" ? info.size : fv.size;
    result.values[f.id] = { ...fv, size: realSize, type: info.contentType ?? fv.type };
  }

  const sourceUrl =
    typeof body.source_url === "string" && /^https?:\/\//.test(body.source_url) ? body.source_url.slice(0, 500) : null;

  const { data: sub, error } = await db
    .from("vw_submissions")
    .insert({ workspace_id: mod.workspaceId, module_id: mod.id, data: result.values, source_url: sourceUrl })
    .select("id, created_at")
    .single();
  if (error || !sub) {
    console.error("[modules/submit] insert failed:", error?.code);
    return json(req, domains, { error: "Something went wrong — please try again." }, 500);
  }

  const eventPayload = {
    submission_id: sub.id,
    module: { id: mod.publicId, type: mod.type, name: mod.config.title },
    workspace: { id: mod.workspaceId, name: mod.workspaceName },
    data: Object.fromEntries(
      Object.entries(result.values).map(([k, v]) =>
        typeof v === "string" ? [k, v] : [k, { file: true, name: v.name, size: v.size, type: v.type }],
      ),
    ),
    fields: mod.config.fields.map((f) => ({ id: f.id, label: f.label, type: f.type })),
    created_at: sub.created_at,
  };

  // Event for the automation service (A6): customer confirmation + owner alert.
  const ev = await db.from("vw_events").insert({
    workspace_id: mod.workspaceId,
    module_id: mod.id,
    submission_id: sub.id,
    type: "submission.created",
    payload: eventPayload,
  });
  if (ev.error) console.error("[modules/submit] event insert failed:", ev.error.code);

  if (gate.alert) after(() => sendUsageAlert(alertWs, gate.alert!));

  // Outgoing webhook, after the response so the visitor never waits on it.
  after(async () => {
    const { data: ws } = await db
      .from("vw_workspaces")
      .select("webhook_url, webhook_secret")
      .eq("id", mod.workspaceId)
      .single();
    if (!ws?.webhook_url) return;
    const r = await sendWebhook(ws.webhook_url, ws.webhook_secret, { type: "submission.created", ...eventPayload });
    await db.from("vw_webhook_deliveries").insert({
      workspace_id: mod.workspaceId,
      submission_id: sub.id,
      status_code: r.status,
      error: r.error,
    });
  });

  return json(req, domains, { ok: true, message: mod.config.successMessage, redirectUrl: mod.config.redirectUrl });
}
