import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// Cross-machine dev activity log. Not session-gated (Windows/Mac local
// scripts have no browser session) — protected by DEV_LOG_SECRET bearer
// token instead. Read by app/admin/dev-activity and by
// scripts/log-dev-activity.mjs --latest at the start of a Claude session.

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.DEV_LOG_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  return token === secret;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    machine?: string;
    summary?: string;
    branch?: string;
    commit_sha?: string;
    version?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.machine || !body.summary) {
    return NextResponse.json({ error: "machine and summary are required" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("dev_activity_log")
    .insert({
      machine: body.machine,
      summary: body.summary,
      branch: body.branch ?? null,
      commit_sha: body.commit_sha ?? null,
      version: body.version ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, entry: data });
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "20") || 20, 100);

  const service = createServiceClient();
  const { data, error } = await service
    .from("dev_activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, entries: data });
}
