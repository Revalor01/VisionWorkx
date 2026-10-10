import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { modulesConfigured, modulesServiceClient } from "@/lib/modules/supabase";
import { UPLOAD_BUCKET } from "@/lib/modules/constants";
import { stripe } from "@/lib/modules/billing";
import { retentionDecision } from "@/lib/modules/retention";
import { retellProvider } from "@/lib/receptionist/voice/retell";

// Daily: delete Modules workspaces whose subscription ended 30+ days ago
// (Terms §10, Privacy §6). Stripe is re-checked for every workspace before
// anything is deleted; comped/active/trialing workspaces are never touched.
// Uploaded files go first (via the storage API), then the workspace row,
// which cascades to modules, submissions, events and members.
export const runtime = "nodejs";
export const maxDuration = 120;

async function listFiles(db: ReturnType<typeof modulesServiceClient>, prefix: string, depth = 0): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(UPLOAD_BUCKET).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`list ${prefix}: ${error.message}`);
    for (const entry of data ?? []) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id) out.push(path);
      else if (depth < 3) out.push(...(await listFiles(db, path, depth + 1)));
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function alertAdmin(subject: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "VisionWorkx <notifications@notify.revalorllc.com>",
      to: [process.env.VW_SIGNUP_ALERT_EMAIL || "admin@revalorllc.com"],
      subject,
      text,
    }),
  }).catch(() => undefined);
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!modulesConfigured()) return NextResponse.json({ skipped: "modules DB not configured" });

  const db = modulesServiceClient();
  const { data: rows, error } = await db
    .from("vw_workspaces")
    .select("id, name, slug, stripe_subscription_id")
    .eq("billing_status", "canceled")
    .limit(100);
  if (error) {
    console.error("[modules-retention] lookup failed:", error.message);
    return NextResponse.json({ error: "lookup failed" }, { status: 500 });
  }

  const deleted: string[] = [];
  const skipped: string[] = [];
  const s = stripe();
  for (const ws of rows ?? []) {
    if (!ws.stripe_subscription_id) {
      skipped.push(`${ws.slug}: no Stripe subscription on record`);
      continue;
    }
    let sub: Stripe.Subscription | null = null;
    try {
      sub = await s.subscriptions.retrieve(ws.stripe_subscription_id);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== "resource_missing") {
        skipped.push(`${ws.slug}: Stripe lookup failed`);
        continue;
      }
    }
    const decision = retentionDecision(sub);
    if (decision.action === "skip") {
      skipped.push(`${ws.slug}: ${decision.reason}`);
      continue;
    }
    if (decision.action === "wait") continue;

    try {
      const { data: mods } = await db.from("vw_modules").select("id").eq("workspace_id", ws.id);
      for (const m of mods ?? []) {
        const files = await listFiles(db, m.id);
        for (let i = 0; i < files.length; i += 100) {
          const { error: rmErr } = await db.storage.from(UPLOAD_BUCKET).remove(files.slice(i, i + 100));
          if (rmErr) throw new Error(`remove files: ${rmErr.message}`);
        }
      }
      // Release the AI receptionist's phone number first, so it stops costing money.
      const { data: numbers } = await db.from("vw_receptionist_numbers").select("phone_e164, provider_agent_id").eq("workspace_id", ws.id).eq("status", "active");
      for (const n of numbers ?? []) {
        if (!process.env.RETELL_API_KEY) throw new Error("phone number can't be released (RETELL_API_KEY not set)");
        await retellProvider().release({ phone: n.phone_e164, agentId: n.provider_agent_id });
      }
      const { error: delErr } = await db.from("vw_workspaces").delete().eq("id", ws.id).eq("billing_status", "canceled");
      if (delErr) throw new Error(`delete workspace: ${delErr.message}`);
      deleted.push(`${ws.name} (/${ws.slug}), subscription ended ${decision.endedAt.toISOString().slice(0, 10)}`);
    } catch (err) {
      skipped.push(`${ws.slug}: ${err instanceof Error ? err.message : "delete failed"}`);
    }
  }

  if (deleted.length || skipped.length) {
    await alertAdmin(
      `VisionWorkx retention: ${deleted.length} deleted, ${skipped.length} need a look`,
      [
        deleted.length ? `Deleted (30 days after subscription ended):\n- ${deleted.join("\n- ")}` : "Deleted: none",
        skipped.length ? `\nSkipped — cancelled in our DB but not safe to delete:\n- ${skipped.join("\n- ")}` : "",
      ].join("\n"),
    );
  }
  return NextResponse.json({ checked: rows?.length ?? 0, deleted: deleted.length, skipped: skipped.length });
}
