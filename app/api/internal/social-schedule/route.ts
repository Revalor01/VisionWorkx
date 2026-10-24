import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { createServiceClient } from "@/lib/supabase";
import { parseScheduleRequest, scheduleForRenaissance } from "@/lib/social/renaissanceSchedule";

export const runtime = "nodejs";

// revalor-admin's Renaissance schedules one post here, under a permission the
// owner approved there (lib/social/renaissanceSchedule.ts runs Social's own
// checks). Not session-gated — protected by RENAISSANCE_SOCIAL_SECRET, set in
// both apps; refuses everything if it's unset. Returns the outcome:
// scheduled, review (saved as a draft), rejected or blocked (nothing saved).

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.RENAISSANCE_SOCIAL_SECRET;
  if (!secret) return false;
  const token = Buffer.from((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(secret);
  return token.length === expected.length && timingSafeEqual(token, expected);
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = parseScheduleRequest(await req.json().catch(() => null), new Date());
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    return NextResponse.json(await scheduleForRenaissance(createServiceClient(), parsed.req));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message.slice(0, 300) : "Failed" }, { status: 500 });
  }
}
