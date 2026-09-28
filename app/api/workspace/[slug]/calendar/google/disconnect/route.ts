import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/modules/ownerApi";
import { disconnect } from "@/lib/modules/googleCalendar";

// Owner disconnects Google Calendar: revoke at Google, forget the token.
// Events already written stay on their calendar.
export const runtime = "nodejs";

export async function POST(req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const auth = await requireOwner(slug);
  if ("error" in auth) return auth.error;
  await disconnect(auth.workspace.id);
  return NextResponse.json({ ok: true });
}
