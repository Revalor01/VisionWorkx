// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseGeneratedCode, ensureMinimalNextFiles } from "./_utils/parseCode.ts";
import { deployToVercel } from "./_utils/vercel.ts";
import { sendDeployEmail } from "./_utils/email.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  // Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { appId } = await req.json() as { appId?: string };
    if (!appId) {
      return json({ error: "appId is required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── 1. Fetch app ──────────────────────────────────────────────
    const { data: app, error: appErr } = await supabase
      .from("apps")
      .select("id, name, user_id, generated_code, status")
      .eq("id", appId)
      .single();

    if (appErr || !app) {
      return json({ error: "App not found" }, 404);
    }

    if (app.status === "deployed") {
      return json({ status: "already_deployed" }, 200);
    }

    if (!app.generated_code) {
      return json({ error: "No generated code to deploy" }, 422);
    }

    // ── 2. Mark as deploying ──────────────────────────────────────
    await supabase
      .from("apps")
      .update({ status: "deploying" })
      .eq("id", appId);

    // ── 3. Parse & enrich code files ─────────────────────────────
    const projectName = slugify(app.name, appId);
    const rawFiles = parseGeneratedCode(app.generated_code as string);
    const files = ensureMinimalNextFiles(rawFiles, projectName);

    console.log(
      `[deploy-app] ${appId}: deploying ${files.length} files as "${projectName}"`
    );

    // ── 4. Deploy to Vercel ───────────────────────────────────────
    let deployUrl: string;
    try {
      deployUrl = await deployToVercel(projectName, files);
    } catch (err) {
      console.error("[deploy-app] Vercel deployment failed:", err);
      await supabase
        .from("apps")
        .update({ status: "deploy_failed" })
        .eq("id", appId);
      return json({ error: "Vercel deployment failed", detail: String(err) }, 502);
    }

    // ── 5. Save deploy_url + mark deployed ───────────────────────
    await supabase
      .from("apps")
      .update({ deploy_url: deployUrl, status: "deployed" })
      .eq("id", appId);

    console.log(`[deploy-app] ${appId}: deployed → ${deployUrl}`);

    // ── 6. Send email notification ────────────────────────────────
    const { data: authUser } = await supabase.auth.admin.getUserById(
      app.user_id as string
    );
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", app.user_id)
      .single();

    const email = (authUser as any)?.user?.email as string | undefined;
    if (email) {
      await sendDeployEmail({
        to: email,
        userName: (profile as any)?.full_name ?? "there",
        appName: app.name as string,
        deployUrl,
      });
    }

    return json({ success: true, deployUrl }, 200);
  } catch (err) {
    console.error("[deploy-app] unexpected error:", err);
    return json({ error: String(err) }, 500);
  }
});

// ── Helpers ───────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function slugify(name: string, id: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
  return `vw-${base || "app"}-${id.slice(0, 8)}`;
}
