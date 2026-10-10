import { NextRequest, NextResponse } from "next/server";
import { modulesConfigured, modulesServerClient } from "@/lib/modules/supabase";

// Members read the AI receptionist conversation behind a submission. Read
// entirely with the member's own session, so RLS limits it to their
// workspace (another workspace's submission id just returns nothing).
export async function GET(req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  await props.params;
  if (!modulesConfigured()) return NextResponse.json({ error: "Not available" }, { status: 503 });
  const submissionId = req.nextUrl.searchParams.get("submission") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(submissionId)) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const supabase = await modulesServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { data: conv } = await supabase
    .from("vw_receptionist_conversations")
    .select("id, channel, started_at")
    .eq("submission_id", submissionId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!conv) return NextResponse.json({ error: "No conversation for this lead." }, { status: 404 });

  const { data: messages } = await supabase
    .from("vw_receptionist_messages")
    .select("role, content, created_at")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: true })
    .limit(200);
  return NextResponse.json(
    { channel: conv.channel, startedAt: conv.started_at, messages: messages ?? [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}
