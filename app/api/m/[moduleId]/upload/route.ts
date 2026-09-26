import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getModuleByPublicId } from "@/lib/modules/data";
import { FILE_MAX_BYTES, FILE_TYPES } from "@/lib/modules/config";
import { modulesConfigured, modulesServiceClient } from "@/lib/modules/supabase";
import { corsHeaders, ipHash, json, originAllowed } from "@/lib/modules/http";
import { UPLOAD_BUCKET } from "@/lib/modules/constants";

// Public: a visitor about to attach a file asks for a one-time signed upload
// link. The file then goes straight to private storage (never through our
// server, which keeps us clear of request-size limits). The path is bound to
// this module, and the submit route re-checks it exists before accepting it.

export const runtime = "nodejs";


function safeName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").replace(/^[.-]+/, "");
  return (cleaned || "file").slice(-100);
}

export async function OPTIONS(req: NextRequest, props: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await props.params;
  if (!modulesConfigured()) return new NextResponse(null, { status: 204 });
  const mod = await getModuleByPublicId(moduleId);
  return new NextResponse(null, { status: 204, headers: corsHeaders(req, mod?.domains ?? []) });
}

export async function POST(req: NextRequest, props: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await props.params;
  if (!modulesConfigured()) return NextResponse.json({ error: "Not available." }, { status: 503 });
  const mod = await getModuleByPublicId(moduleId);
  if (!mod || mod.status !== "live") return NextResponse.json({ error: "This form isn't available." }, { status: 404 });
  if (!originAllowed(req, mod.domains)) return json(req, mod.domains, { error: "Not allowed from this website." }, 403);

  let body: { field?: unknown; name?: unknown; size?: unknown; type?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(req, mod.domains, { error: "Invalid request." }, 400);
  }
  const field = mod.config.fields.find((f) => f.id === body.field && f.type === "file");
  if (!field) return json(req, mod.domains, { error: "This form doesn't take files there." }, 400);
  const size = typeof body.size === "number" ? body.size : 0;
  const type = typeof body.type === "string" ? body.type : "";
  if (size <= 0 || size > FILE_MAX_BYTES) return json(req, mod.domains, { error: "Files can be up to 10 MB." }, 400);
  if (!(FILE_TYPES as readonly string[]).includes(type)) {
    return json(req, mod.domains, { error: "Attach a photo (JPG, PNG, WebP, HEIC, GIF) or a PDF." }, 400);
  }

  const db = modulesServiceClient();
  const [perIp, perModule] = await Promise.all([
    db.rpc("vw_rate_check", { p_key: `up:${mod.publicId}:${ipHash(req)}`, max_hits: 15, window_seconds: 600 }),
    db.rpc("vw_rate_check", { p_key: `up:${mod.publicId}`, max_hits: 500, window_seconds: 3600 }),
  ]);
  if (perIp.data === false || perModule.data === false) {
    return json(req, mod.domains, { error: "Too many uploads — please try again in a few minutes." }, 429, { "Retry-After": "600" });
  }

  const path = `${mod.id}/${randomUUID()}/${safeName(typeof body.name === "string" ? body.name : "file")}`;
  const { data, error } = await db.storage.from(UPLOAD_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[modules/upload] signed URL failed:", error?.message);
    return json(req, mod.domains, { error: "Couldn't start the upload — please try again." }, 500);
  }
  return json(req, mod.domains, { path: data.path, token: data.token, signedUrl: data.signedUrl });
}
