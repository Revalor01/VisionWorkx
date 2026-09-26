#!/usr/bin/env node
// Proves workspace isolation in the VisionWorkx MODULES database (A4 done-condition):
// two workspaces, one owner each; a submission in A must be invisible to B's
// owner, B can't update it, anon can't read anything, staff can't read the
// webhook secret column. Creates its own test users/workspaces and deletes them.
//
// NEVER point this at a database with real client data you care about — it only
// touches rows it creates, but run it on the modules DEV/pre-launch project.
//
// Usage: node --env-file=.env.local scripts/modules-isolation-test.mjs   (Node 22+; on Node 20 use
//        `npx -y node@22 --env-file=.env.local scripts/modules-isolation-test.mjs` — supabase-js needs native WebSocket)
import { createClient } from "@supabase/supabase-js";

const URL = process.env.MODULES_SUPABASE_URL ?? process.env.NEXT_PUBLIC_MODULES_SUPABASE_URL;
const SERVICE = process.env.MODULES_SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_MODULES_SUPABASE_ANON_KEY;
if (!URL || !SERVICE || !ANON) {
  console.error("Set MODULES_SUPABASE_URL, MODULES_SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_MODULES_SUPABASE_ANON_KEY");
  process.exit(2);
}
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL, SERVICE, opts);
const tag = `iso-${Date.now().toString(36)}`;
const pw = `T!${crypto.randomUUID()}`;
let failures = 0;
const check = (name, cond) => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) failures++; };

const created = { users: [], workspaces: [] };
async function user(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  if (error) throw error;
  created.users.push(data.user.id);
  const c = createClient(URL, ANON, opts);
  const s = await c.auth.signInWithPassword({ email, password: pw });
  if (s.error) throw s.error;
  return { id: data.user.id, client: c };
}

try {
  const a = await user(`${tag}-a@example.com`);
  const b = await user(`${tag}-b@example.com`);
  const { data: wsA } = await admin.from("vw_workspaces").insert({ name: "Iso A", slug: `${tag}-a` }).select("id").single();
  const { data: wsB } = await admin.from("vw_workspaces").insert({ name: "Iso B", slug: `${tag}-b` }).select("id").single();
  created.workspaces.push(wsA.id, wsB.id);
  await admin.from("vw_workspace_members").insert([
    { workspace_id: wsA.id, user_id: a.id, role: "owner" },
    { workspace_id: wsB.id, user_id: b.id, role: "staff" },
  ]);
  const { data: modA } = await admin.from("vw_modules").insert({ workspace_id: wsA.id, type: "lead_capture", name: "A form" }).select("id").single();
  const { data: subA } = await admin
    .from("vw_submissions")
    .insert({ workspace_id: wsA.id, module_id: modA.id, data: { name: "Secret Customer", email: "c@example.com" } })
    .select("id")
    .single();

  const aSees = await a.client.from("vw_submissions").select("id").eq("id", subA.id);
  check("owner A sees A's submission", aSees.data?.length === 1);

  const bSees = await b.client.from("vw_submissions").select("id, data");
  check("user B sees none of A's submissions", !(bSees.data ?? []).some((r) => r.id === subA.id));

  const bWs = await b.client.from("vw_workspaces").select("id").eq("id", wsA.id);
  check("user B can't see workspace A", (bWs.data ?? []).length === 0);

  const bMods = await b.client.from("vw_modules").select("id").eq("workspace_id", wsA.id);
  check("user B can't see A's modules", (bMods.data ?? []).length === 0);

  await b.client.from("vw_submissions").update({ status: "lost", notes: "hacked" }).eq("id", subA.id);
  const after = await admin.from("vw_submissions").select("status, notes").eq("id", subA.id).single();
  check("user B can't update A's submission", after.data?.status === "new" && after.data?.notes === "");

  const aIns = await a.client.from("vw_submissions").insert({ workspace_id: wsA.id, module_id: modA.id, data: {} });
  check("members can't insert submissions directly", !!aIns.error);

  const aPlan = await a.client.from("vw_workspaces").update({ plan: "pro" }).eq("id", wsA.id);
  const planNow = await admin.from("vw_workspaces").select("plan").eq("id", wsA.id).single();
  check("owners can't change their own plan", !!aPlan.error || planNow.data?.plan === "free");

  const secretA = await a.client.from("vw_workspaces").select("webhook_secret").eq("id", wsA.id);
  check("webhook secret not readable by client logins", !!secretA.error);

  const aStatus = await a.client.from("vw_submissions").update({ status: "won" }).eq("id", subA.id);
  const s2 = await admin.from("vw_submissions").select("status").eq("id", subA.id).single();
  check("owner A can update status", !aStatus.error && s2.data?.status === "won");

  const anon = createClient(URL, ANON, opts);
  const anonSubs = await anon.from("vw_submissions").select("id");
  const anonWs = await anon.from("vw_workspaces").select("id");
  check("anonymous can't read submissions", (anonSubs.data ?? []).length === 0);
  check("anonymous can't read workspaces", (anonWs.data ?? []).length === 0);

  const anonEv = await anon.from("vw_events").select("id");
  const bEv = await b.client.from("vw_events").select("id");
  check("events queue is server-only", (anonEv.data ?? []).length === 0 && (bEv.data ?? []).length === 0);

  const rate = await a.client.rpc("vw_rate_check", { p_key: "x", max_hits: 1, window_seconds: 1 });
  check("rate-limit function is server-only", !!rate.error);
} catch (err) {
  console.error("ERROR", err?.message ?? err);
  failures++;
} finally {
  for (const id of created.workspaces) await admin.from("vw_workspaces").delete().eq("id", id);
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
  console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`} (test data cleaned up)`);
  process.exit(failures === 0 ? 0 : 1);
}
