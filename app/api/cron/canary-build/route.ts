import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createPreviewApp, runPreviewGenerate } from "@/lib/apps/preview";
import {
  removeTenantSchema,
  tenantSchemaExists,
  reconcilePostgrestSchemas,
} from "@/lib/apps/tenantSchema";
import { notifyBuildFailure } from "@/lib/apps/operatorAlert";
import { CANARY_EMAIL_SUFFIX } from "@/lib/apps/canaryApps";
import type { AppCategory, IntakeData } from "@/lib/database.types";

export const runtime = "nodejs";
export const maxDuration = 120;

// The golden-intake reliability suite. Each cron run: (1) grades the
// previous run's builds and (2) fires a fresh set. Every build is a row
// in build_canary_runs — the /admin "Build Reliability" panel reads the
// pass rate off that. A build that doesn't deploy also pages the operator:
// the pipeline is broken for real customers too.
// One email per intake — `apps` has a partial unique index on
// preview_email for unclaimed rows, so all four canaries can't share one.
const canaryEmail = (key: string) => `canary+${key}${CANARY_EMAIL_SUFFIX}`;
// No "+" in the pattern: PostgREST decodes "+" in a query string to a
// space, so `.like("...canary+%...")` silently matches nothing. The
// ".internal" TLD is canary-only (real test users are @visionworkx.dev).
// Derived from the shared suffix (lib/apps/canaryApps.ts) so this can't
// drift from the same check used to exclude canary rows from /admin's
// real-app stats and to pick the canary-cheap model.
const CANARY_EMAIL_LIKE = `%${CANARY_EMAIL_SUFFIX}`;

function intake(over: Partial<IntakeData> & { category: AppCategory }): IntakeData {
  return {
    businessName: "Canary Test Co",
    businessType: "Small local business",
    location: "Austin, TX",
    description: "A simple app for a small business — one admin view, one customer view.",
    secondaryCategories: [],
    features: [],
    primaryColor: "#1A3A5C",
    backgroundColor: "#F8FAFC",
    font: "Inter",
    ...over,
  };
}

const GOLDEN: { key: string; intake: IntakeData }[] = [
  {
    key: "booking",
    intake: intake({
      category: "booking",
      businessName: "Canary Coffee",
      businessType: "Neighborhood coffee shop",
      description: "Customers book a table online and see opening hours. One admin list of bookings.",
    }),
  },
  {
    key: "booking_crm",
    intake: intake({
      category: "booking",
      secondaryCategories: ["crm"],
      businessName: "Canary Salon",
      businessType: "Hair salon",
      description: "Online appointment booking plus a simple client list with notes.",
    }),
  },
  {
    key: "invoicing",
    intake: intake({
      category: "invoicing",
      businessName: "Canary Plumbing",
      businessType: "Plumbing contractor",
      description: "Send quotes and invoices, let customers pay online, track what's paid.",
    }),
  },
  {
    key: "portal",
    intake: intake({
      category: "portal",
      businessName: "Canary Law",
      businessType: "Small law firm",
      description: "Clients log in to see case status, share documents, and message us.",
    }),
  },
  {
    key: "storefront",
    intake: intake({
      category: "storefront",
      businessName: "Canary Candles",
      businessType: "Small candle maker",
      description:
        "Sell about 15 candles online — a photo or two each, one price each. Customers browse, add to cart, enter their address, and pay. One admin screen to add products and mark orders shipped.",
    }),
  },
];

// Cost lever added 2026-09-13: firing all 5 categories every cron tick
// was the single biggest volume driver behind ~$230/mo of canary spend
// with 0 paying customers. Rotate through a subset instead — 1/night by
// default cycles all 5 categories over 5 nights (still real coverage,
// just spread out) instead of testing everything every night. The
// rotation index is derived from days-since-epoch (stable across a
// whole UTC day, no persisted state needed) so it advances predictably
// regardless of how many times this route happens to run in one day.
// CANARY_CATEGORIES_PER_NIGHT overrides the count if a faster streak
// matters more than cost at some point — set back to GOLDEN.length for
// the original "test everything nightly" behavior.
function todaysGolden(): typeof GOLDEN {
  const perNight = Math.max(
    1,
    Math.min(GOLDEN.length, Number(process.env.CANARY_CATEGORIES_PER_NIGHT) || 1),
  );
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  const start = dayIndex % GOLDEN.length;
  return Array.from({ length: perNight }, (_, i) => GOLDEN[(start + i) % GOLDEN.length]);
}

// A build can reach "deployed" and still be broken at runtime. Two checks
// against the live app root:
//  1. Redirect loop — a Next-major drift breaks server-side auth so the
//     app bounces /login <-> home forever. Follow the chain a few hops;
//     an oscillation or a 5xx is a failure even though the deploy "worked".
//  2. Framework drift — `next/font` emits `__variable_*` class names on
//     Next 15+ and `__className_*` on 14. Generated apps are pinned to 14
//     (deploy/route.ts); if a build shows the 15+ marker the pin slipped
//     and auth will loop as soon as there's a session — fail it now.
// A transient fetch error / timeout is ignored — it must not fail the
// pipeline signal on its own.
async function smokeCheck(
  deployUrl: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    let url = deployUrl;
    const seen: string[] = [];
    let finalRes: Response | null = null;
    for (let hop = 0; hop < 6; hop++) {
      const res = await fetch(url, { redirect: "manual", signal: ac.signal });
      if (res.status >= 500) {
        return { ok: false, reason: `runtime ${res.status} at ${new URL(url).pathname}` };
      }
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) { finalRes = res; break; }
        const next = new URL(loc, url);
        const path = next.pathname;
        seen.push(path);
        // same path 3× or an A→B→A→B oscillation = a redirect loop
        if (
          seen.filter((p) => p === path).length >= 3 ||
          (seen.length >= 4 &&
            seen[seen.length - 1] === seen[seen.length - 3] &&
            seen[seen.length - 2] === seen[seen.length - 4])
        ) {
          return {
            ok: false,
            reason: `redirect loop (${seen.slice(-4).join(" → ")}) — likely a Next 15/16 SSR-auth regression`,
          };
        }
        url = next.toString();
        continue;
      }
      finalRes = res; // 2xx / 4xx — the app is serving, not looping
      break;
    }

    if (finalRes && finalRes.ok) {
      const html = (await finalRes.text().catch(() => "")).slice(0, 8000);
      if (/__variable_[a-f0-9]/.test(html) && !/__className_[a-f0-9]/.test(html)) {
        return {
          ok: false,
          reason: "app built on Next 15/16 (next/font __variable_ marker) — the ^14.2.0 pin slipped; server-side auth will loop",
        };
      }
    }
    return { ok: true };
  } catch {
    return { ok: true }; // transient network error / timeout — don't fail the build on it
  } finally {
    clearTimeout(timer);
  }
}

// Vercel names a generated-app project `vw-<name slug, 30 chars>-<appId[:8]>`
// (see slugify() in app/api/deploy/route.ts). Reconstruct it so we can delete
// the project even when apps.vercel_project_id was never written.
function canaryProjectName(name: string, appId: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  return `vw-${base || "app"}-${appId.slice(0, 8)}`;
}

async function deleteCanaryVercelProject(
  appId: string,
  name: string,
  vercelProjectId: string | null,
): Promise<void> {
  const token = process.env.VERCEL_API_TOKEN;
  if (!token) return;
  const team = process.env.VERCEL_TEAM_ID
    ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}`
    : "";
  // Try the stored id first, then the deterministic project name.
  const handles = [vercelProjectId, canaryProjectName(name, appId)].filter(
    (h): h is string => Boolean(h),
  );
  let deleted = false;
  let sawNotFound = false;
  for (const handle of handles) {
    try {
      const res = await fetch(
        `https://api.vercel.com/v9/projects/${encodeURIComponent(handle)}${team}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        deleted = true;
        break;
      }
      if (res.status === 404) sawNotFound = true;
    } catch {
      /* try the next handle */
    }
  }
  if (!deleted && !sawNotFound) {
    console.error(`[canary] could not delete Vercel project for ${appId} (${name})`);
  }
}

export async function GET(req: NextRequest) {
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Cost kill-switch (added 2026-09-13, zero real customers yet, canary
  // was ~$230/mo of Anthropic spend). Set CANARY_DISABLED=true in Vercel's
  // env vars to stop the nightly cron from grading or firing anything —
  // costs nothing further either way, since this returns before any
  // Claude call. Unset (or any value other than "true") keeps the
  // existing behavior, so this is a no-op until someone opts in. New env
  // vars need a fresh deploy to take effect (Vercel doesn't apply them to
  // an already-built deployment). Currently-pending runs are just left as
  // "pending" — nothing is lost, the next enabled run grades them.
  if (process.env.CANARY_DISABLED === "true") {
    return NextResponse.json({ disabled: true, message: "Canary is paused (CANARY_DISABLED=true) — grading and firing both skipped." });
  }

  const service = createServiceClient();

  // Cost auto-pause (added 2026-09-13, alongside CANARY_DISABLED above): a
  // safety net that doesn't depend on anyone remembering to flip the
  // manual switch. Sums this calendar month's app-building spend
  // (app_generate + app_generate_plan + app_deploy_repair) against a
  // configurable budget. Not perfectly canary-only — ai_usage_log doesn't
  // tag canary vs. real builds, and canary apps get torn down after each
  // cycle so a historical join back to apps.preview_email isn't reliable
  // — but real-customer volume is ~0/month right now, so total spend is a
  // fair proxy in practice, and this only ever pauses THIS cron, never a
  // real customer's own /api/generate call. Over budget: still grade
  // whatever's already pending (free — just a status check, no Claude
  // call) but skip firing anything new. Resets naturally each month.
  const CANARY_MONTHLY_BUDGET_USD = Number(process.env.CANARY_MONTHLY_BUDGET_USD) || 50;
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const { data: usageRows } = await service
    .from("ai_usage_log")
    .select("cost_usd")
    .in("source", ["app_generate", "app_generate_plan", "app_deploy_repair"])
    .gte("created_at", monthStart);
  const monthSpend = (usageRows ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  const budgetExceeded = monthSpend >= CANARY_MONTHLY_BUDGET_USD;
  if (budgetExceeded) {
    console.warn(
      `[canary] this month's app-building spend $${monthSpend.toFixed(2)} has crossed the $${CANARY_MONTHLY_BUDGET_USD} budget — skipping this cycle's fire (grading still runs)`,
    );
  }

  // 1. Grade every still-pending run.
  const { data: pending } = await service
    .from("build_canary_runs")
    .select("id, intake_key, app_id, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const graded: Record<string, string> = {};
  for (const run of pending ?? []) {
    if (!run.app_id) continue;
    const { data: app } = await service
      .from("apps")
      .select("status, failure_reason, deploy_url")
      .eq("id", run.app_id)
      .maybeSingle();
    const ageMin = (Date.now() - new Date(run.created_at).getTime()) / 60000;
    const running = app && ["generating", "ready", "deploying"].includes(app.status);
    if (running && ageMin < 35) continue; // still building — grade next run

    let pass = app?.status === "deployed";
    let failReason = pass
      ? null
      : app?.failure_reason ?? (app ? app.status : "no app row");

    // Deployed builds get a runtime smoke check — a green deploy that
    // redirect-loops or 5xxs is still a broken build.
    if (pass && app?.deploy_url) {
      const smoke = await smokeCheck(app.deploy_url);
      if (!smoke.ok) {
        pass = false;
        failReason = smoke.reason;
      }
    }

    graded[run.intake_key] = pass ? "pass" : "fail";
    await service
      .from("build_canary_runs")
      .update({
        status: pass ? "pass" : "fail",
        failure_reason: failReason,
        deploy_url: app?.deploy_url ?? null,
        // Only a lie otherwise: if we didn't grade within ~45 min of
        // creation we don't know the real build time.
        duration_sec: ageMin <= 45 ? Math.round(ageMin * 60) : null,
        graded_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    if (!pass) {
      await notifyBuildFailure({
        stage: "canary",
        appId: run.app_id,
        appName: `Canary — ${run.intake_key}`,
        customer: null,
        error: `Golden build "${run.intake_key}" failed — ${failReason}. The generate → deploy pipeline is failing for this shape.`,
        title: `🔴 CANARY FAILED (${run.intake_key}) — the build pipeline is degraded`,
      });
    }
  }

  // A set is still in flight (e.g. the 10-minute schedule fired again
  // mid-build) — grade only, don't stack another set.
  const { data: stillPending } = await service
    .from("build_canary_runs")
    .select("id, created_at")
    .eq("status", "pending");
  const inFlight = (stillPending ?? []).some(
    (r) => Date.now() - new Date(r.created_at).getTime() < 45 * 60_000,
  );
  if (inFlight) {
    return NextResponse.json({ graded, fired: [], skipped: "set in flight" });
  }

  // 2. Fully tear down the previous canary set: Vercel project + tenant
  // schema (+ its db_schema entry) + row. A canary run must leave NO residue
  // — the audit found ~10 leaked schemas and ~12 leaked Vercel projects from
  // this step's old failure modes: a null vercel_project_id skipped the
  // project delete, and the row was deleted even when the schema drop failed,
  // orphaning it. (docs/stabilization-plan.md T0.4)
  const { data: oldCanaries } = await service
    .from("apps")
    .select("id, name, vercel_project_id")
    .like("preview_email", CANARY_EMAIL_LIKE);
  for (const c of oldCanaries ?? []) {
    await deleteCanaryVercelProject(c.id, c.name, c.vercel_project_id);
    await removeTenantSchema(c.id); // unexpose-then-drop, landmine-safe

    // Only drop the row once its schema is actually gone. If the drop failed
    // (transient Management API error), keep the row so the NEXT run retries
    // instead of orphaning the schema forever.
    let schemaGone = true;
    try {
      schemaGone = !(await tenantSchemaExists(c.id));
    } catch {
      schemaGone = false;
    }
    if (schemaGone) {
      await service.from("apps").delete().eq("id", c.id);
    } else {
      console.error(
        `[canary] schema for ${c.id} still present after teardown — keeping the row for retry`,
      );
    }
  }
  // Belt-and-braces: heal any stale db_schema exposure entry left by a drop
  // that partially failed in a past run.
  await reconcilePostgrestSchemas().catch((err) =>
    console.error("[canary] reconcilePostgrestSchemas failed:", err),
  );
  // Anything still pending here is ≥45 min old and never graded (no app_id,
  // or a lost grade) — record it as a failure rather than silently deleting
  // it, so a chronically stuck shape shows up in the pass rate.
  await service
    .from("build_canary_runs")
    .update({
      status: "fail",
      failure_reason: "stuck — no deployable app within the grading window",
      graded_at: new Date().toISOString(),
    })
    .eq("status", "pending");

  // 3. Fire a fresh set.
  //
  // Step 2 is best-effort: if a schema drop couldn't be verified (e.g. a
  // transient Management API blip survived even the mgmtFetch retries),
  // that canary's old row is deliberately kept for retry rather than
  // deleted. apps_preview_email_unclaimed_idx means firing straight into
  // that is a guaranteed, self-inflicted "could not start" — a teardown
  // lag, not a real generate/deploy failure. Skip it cleanly instead of
  // recording a hard fail: the next cron tick's step 2 will pick the old
  // row up again and retry the teardown.
  const skipped: string[] = [];
  const fired: string[] = [];
  for (const g of budgetExceeded ? [] : todaysGolden()) {
    const email = canaryEmail(g.key);
    const { data: stale } = await service
      .from("apps")
      .select("id")
      .eq("preview_email", email)
      .is("claimed_at", null)
      .maybeSingle();
    if (stale) {
      console.warn(`[canary] ${g.key} still torn down from a previous cycle (app ${stale.id}) — skipping this fire, not a build failure`);
      skipped.push(g.key);
      continue;
    }
    try {
      const { id } = await createPreviewApp(email, g.intake, { skipDedup: true });
      await service.from("build_canary_runs").insert({
        intake_key: g.key,
        app_id: id,
        status: "pending",
      });
      void runPreviewGenerate(id);
      fired.push(g.key);
    } catch (err) {
      await service.from("build_canary_runs").insert({
        intake_key: g.key,
        status: "fail",
        failure_reason: `could not start: ${err instanceof Error ? err.message : String(err)}`,
        graded_at: new Date().toISOString(),
      });
      await notifyBuildFailure({
        stage: "canary",
        appId: "-",
        appName: `Canary — ${g.key}`,
        customer: null,
        error: `Couldn't even start the "${g.key}" canary: ${
          err instanceof Error ? err.message : String(err)
        }`,
        title: "🔴 CANARY couldn't start",
      });
    }
  }

  return NextResponse.json({
    graded,
    fired,
    skipped,
    budgetExceeded,
    monthSpendUsd: Number(monthSpend.toFixed(2)),
  });
}
