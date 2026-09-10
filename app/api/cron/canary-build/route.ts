import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createPreviewApp, runPreviewGenerate } from "@/lib/apps/preview";
import { removeTenantSchema } from "@/lib/apps/tenantSchema";
import { notifyBuildFailure } from "@/lib/apps/operatorAlert";
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
const canaryEmail = (key: string) => `canary+${key}@visionworkx.internal`;
// No "+" in the pattern: PostgREST decodes "+" in a query string to a
// space, so `.like("...canary+%...")` silently matches nothing. The
// ".internal" TLD is canary-only (real test users are @visionworkx.dev).
const CANARY_EMAIL_LIKE = "%@visionworkx.internal";

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

export async function GET(req: NextRequest) {
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const service = createServiceClient();

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

  // 2. Fully tear down previous canary apps (Vercel project + tenant
  // schema + db_schema entry + row) so they don't accumulate. Then drop
  // any orphaned pending rows.
  const { data: oldCanaries } = await service
    .from("apps")
    .select("id, vercel_project_id")
    .like("preview_email", CANARY_EMAIL_LIKE);
  for (const c of oldCanaries ?? []) {
    if (c.vercel_project_id && process.env.VERCEL_API_TOKEN) {
      const team = process.env.VERCEL_TEAM_ID
        ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}`
        : "";
      await fetch(`https://api.vercel.com/v9/projects/${c.vercel_project_id}${team}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${process.env.VERCEL_API_TOKEN}` },
      }).catch(() => {});
    }
    await removeTenantSchema(c.id);
  }
  await service.from("apps").delete().like("preview_email", CANARY_EMAIL_LIKE);
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
  const fired: string[] = [];
  for (const g of GOLDEN) {
    try {
      const { id } = await createPreviewApp(canaryEmail(g.key), g.intake, { skipDedup: true });
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

  return NextResponse.json({ graded, fired });
}
