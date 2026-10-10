import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/modules/ownerApi";
import { modulesServiceClient } from "@/lib/modules/supabase";
import { getModuleByPublicId } from "@/lib/modules/data";
import { billingAllowsService } from "@/lib/modules/plans";
import { voiceEnabled } from "@/lib/receptionist/voice/provider";
import { agentSpecFor, provider } from "@/lib/receptionist/voice/server";

// Owners get (POST) or release (DELETE) their AI receptionist's phone number.
// One active number per workspace (also enforced by a unique index). Buying a
// number costs real money, so it needs an active plan and is rate-limited.

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const auth = await requireOwner(slug);
  if ("error" in auth) return auth.error;
  if (!voiceEnabled()) return NextResponse.json({ error: "The phone receptionist isn't switched on yet." }, { status: 503 });
  if (!billingAllowsService(auth.workspace.billing_status) || auth.workspace.billing_status === "past_due") {
    return NextResponse.json({ error: "Start your plan on the Billing page to get a phone number." }, { status: 402 });
  }

  let body: { moduleId?: unknown; areaCode?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const mod = typeof body.moduleId === "string" ? await getModuleByPublicId(body.moduleId) : null;
  if (!mod || mod.workspaceId !== auth.workspace.id || mod.type !== "receptionist" || !mod.receptionist) {
    return NextResponse.json({ error: "Save your receptionist first." }, { status: 400 });
  }
  const areaCode = typeof body.areaCode === "string" && /^[2-9][0-9]{2}$/.test(body.areaCode.trim()) ? Number(body.areaCode.trim()) : null;

  const db = modulesServiceClient();
  const { data: existing } = await db.from("vw_receptionist_numbers").select("phone_e164").eq("workspace_id", auth.workspace.id).eq("status", "active").maybeSingle();
  if (existing) return NextResponse.json({ error: "You already have a number.", phone: existing.phone_e164 }, { status: 409 });
  const { data: allowed } = await db.rpc("vw_rate_check", { p_key: `rnum:${auth.workspace.id}`, max_hits: 3, window_seconds: 86400 });
  if (allowed === false) return NextResponse.json({ error: "You've changed numbers a few times today — try again tomorrow." }, { status: 429 });

  const voice = provider();
  let agentId: string | null = null;
  let phone: string | null = null;
  try {
    agentId = await voice.syncAgent(await agentSpecFor(mod));
    phone = await voice.buyNumber({ agentId, areaCode, nickname: `VW ${auth.workspace.slug}` });
  } catch (err) {
    console.error("[receptionist/number] provisioning failed:", err instanceof Error ? err.message : err);
    if (agentId) await voice.release({ phone: phone ?? "", agentId }).catch(() => {});
    return NextResponse.json(
      { error: areaCode ? `No numbers available in ${areaCode} right now — try another area code or leave it blank.` : "Couldn't get a number right now — please try again." },
      { status: 502 },
    );
  }

  const { error } = await db
    .from("vw_receptionist_numbers")
    .insert({ workspace_id: auth.workspace.id, module_id: mod.id, phone_e164: phone, provider: "retell", provider_agent_id: agentId });
  if (error) {
    console.error("[receptionist/number] insert failed:", error.code);
    await voice.release({ phone, agentId }).catch(() => {});
    return NextResponse.json({ error: "Couldn't save the number — please try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, phone });
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const auth = await requireOwner(slug);
  if ("error" in auth) return auth.error;
  const db = modulesServiceClient();
  const { data: number } = await db
    .from("vw_receptionist_numbers")
    .select("id, phone_e164, provider_agent_id")
    .eq("workspace_id", auth.workspace.id)
    .eq("status", "active")
    .maybeSingle();
  if (!number) return NextResponse.json({ error: "No number to release." }, { status: 404 });
  try {
    await provider().release({ phone: number.phone_e164, agentId: number.provider_agent_id });
  } catch (err) {
    console.error("[receptionist/number] release failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't release the number — please try again." }, { status: 502 });
  }
  await db.from("vw_receptionist_numbers").update({ status: "released", released_at: new Date().toISOString() }).eq("id", number.id);
  return NextResponse.json({ ok: true });
}
