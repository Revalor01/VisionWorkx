import { after, NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import { logAiUsage } from "@/lib/aiUsage";
import { recordInitialRevision } from "@/lib/apps/redeploy";
import { categoryTakesPayments } from "@/lib/apps/payments";
import { parseFileMap, serializeFileMap } from "@/lib/apps/fileMap";
import { validateGenerated } from "@/lib/apps/validateGenerated";
import { repairGenerated } from "@/lib/apps/repairGenerated";
import { generatePlan } from "@/lib/apps/generatePlan";
import { notifyBuildFailure } from "@/lib/apps/operatorAlert";
import { classifyBuildError, operatorAlertTitle } from "@/lib/apps/buildFailure";
import { DEFAULT_BUILD_NOTICE } from "@/lib/apps/clientStatus";
import type { AppCategory, IntakeData } from "@/lib/database.types";
import {
  LOCATION_FEATURE,
  BILINGUAL_FEATURE,
  QR_CODE_FEATURE,
  CALENDAR_EXPORT_FEATURE,
  TEAM_ACCESS_FEATURE,
} from "@/lib/features";

export const runtime = "nodejs";
// A single streamed completion (up to 32000 output tokens) for a large,
// feature-rich app can legitimately run past 5 minutes. 300s was getting
// hard-killed by the platform mid-stream — same failure mode as the deploy
// route: no catch block runs on a platform-level kill, so apps.status got
// stuck on "generating" forever. Confirmed via Vercel runtime error logs
// (Task timed out after 300 seconds, routes=/api/generate).
export const maxDuration = 900;

// ---------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------
export const SYSTEM_PROMPT = `You are an expert Next.js 14 and Supabase developer. Generate a complete, production-ready web application based on the business requirements provided.

Output ONLY code files — no explanations, no preamble, no text outside the file blocks. Use this exact format:

[FILENAME: path/to/file.tsx]
<file content here>
[/FILENAME]

Tech stack:
- Next.js 14 App Router, TypeScript throughout.
- Supabase for auth + postgres database (@supabase/supabase-js, @supabase/ssr)
- Tailwind CSS for all styling — no external UI component libraries
- next/font/google for the font

The platform PROVIDES these files — do NOT emit them, do NOT reference your own
version, anything you write to these paths is discarded:
  package.json, tsconfig.json, next.config.mjs, tailwind.config.ts,
  postcss.config.js, next-env.d.ts, .gitignore, .env.local.example,
  lib/supabase.ts, lib/supabase-server.ts
The ONLY npm packages available are: next, react, react-dom, @supabase/ssr,
@supabase/supabase-js, lucide-react. Do NOT import any other package — there is
no package.json for you to add one to, and the build will fail.

Files to generate:
- app/layout.tsx
- app/page.tsx  (auth-protected main view)
- app/login/page.tsx
- app/globals.css  (@tailwind base/components/utilities + your theme)
- All feature pages for the requested category
- components/ (reusable UI)
- any domain-only helpers under lib/ (NOT lib/supabase.ts / lib/supabase-server.ts)
- supabase/migrations/001_init.sql (schema + RLS policies — use gen_random_uuid() not uuid_generate_v4())

Rules:
1. Every page that shows user data must call supabase.auth.getUser() and redirect to /login if unauthenticated
2. All database tables must have RLS enabled — users can only access their own rows
3. Never put SUPABASE_SERVICE_ROLE_KEY or any secret in client-side code
4. Loading states on every async action; skeleton loaders on data-fetching components
5. Error boundaries with user-friendly messages
6. Mobile-first responsive design
7. The app must be simple enough for a non-technical small business owner to manage
8. Use the provided primary color for buttons, headings, and accents
9. Use the provided font throughout (import from next/font/google)
10. The Supabase clients already exist (platform-provided) — do NOT write them.
    - Client Components ("use client"): \`import { createClient } from '@/lib/supabase'\`
    - Server Components / layouts / route handlers: \`import { createServerSupabaseClient } from '@/lib/supabase-server'\` (NEVER from '@/lib/supabase' — its \`next/headers\` import breaks any Client Component bundle). A privileged server client is also exported: \`createServiceRoleClient\` from the same file.
    Both use \`cookies()\` synchronously (Next 14) and read the tenant schema from \`NEXT_PUBLIC_SUPABASE_SCHEMA\` — you never pass a schema yourself.

11. CRITICAL — NEVER write a trigger, function, or any DDL that touches \`auth.users\` or the \`public\` schema in the migration SQL. This app's database is a multi-tenant Postgres project — \`auth.users\` and \`public\` are shared across every tenant, and a trigger like \`on_auth_user_created ON auth.users\` will silently overwrite the platform's own trigger and break signups for every other tenant. This means:
    - Do NOT create a "profile auto-creation" trigger on auth.users. Instead, insert the profile row directly from application code, right after \`supabase.auth.signUp()\` succeeds in the signup page/handler:
      \`\`\`typescript
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (data.user) {
        await supabase.from('profiles').insert({ id: data.user.id, full_name: fullName })
      }
      \`\`\`
    - Foreign keys like \`references auth.users(id)\` are fine and expected — only CREATE/ALTER/DROP statements targeting auth.* or public.* are forbidden
    - All tables you create must live implicitly in the tenant's own schema (the migration runs with search_path already scoped to it) — never schema-qualify a CREATE/ALTER/DROP with \`public.\` or \`auth.\`

12. CRITICAL — a \`site_settings\` table already exists in your schema before your migration ever runs (the platform creates it, not you). It holds the business's logo, social media links, and brand colors, which the business owner can update at any time from their VisionWorkx dashboard WITHOUT redeploying this app. Because of that:
    - NEVER create a table named \`site_settings\` yourself, and NEVER INSERT/UPDATE/DELETE it — it is READ-ONLY from your generated code, SELECT only.
    - NEVER hardcode a literal logo image URL or a literal social media link anywhere in your code — always read them from \`site_settings\` at runtime. (Brand colors work the same way — see rule 13.)
    - Shape (already exists, do not create it): \`site_settings(id boolean, logo_url text | null, social_links jsonb, primary_color_rgb text, background_color_rgb text, gallery_photos jsonb, updated_at timestamptz)\`. \`social_links\` keys you may read, all optional: \`instagram\`, \`facebook\`, \`tiktok\`, \`twitter\`, \`linkedin\`, \`youtube\`. \`gallery_photos\` is a JSON array of full image URL strings — do NOT fetch it here; see rule 14, it is fetched separately by the public homepage only.
    - Fetch it ONCE in \`app/layout.tsx\` (or a component it renders, e.g. a shared header/footer) using \`createServerSupabaseClient\` from \`@/lib/supabase-server\` — server-side only, NEVER from a Client Component or the browser client. This single fetch also supplies the color variables rule 13 needs. The ONLY exception to "never add a second \`site_settings\` query" is the public homepage's own gallery-photos fetch described in rule 14 below — every other file must reuse this layout fetch and must never query \`site_settings\` itself.
    - The file that fetches it MUST include \`export const dynamic = 'force-dynamic'\` — without this, Next.js freezes the value at build time via static generation, and a business owner's settings changes will silently never appear without a full rebuild.
    - Render the logo and each social link ONLY when present — never a placeholder image or a dead/example link. Never use \`dangerouslySetInnerHTML\` for these values.

    Required pattern (includes the color variables rule 13 needs):
    \`\`\`typescript
    // app/layout.tsx
    export const dynamic = 'force-dynamic'

    import { createServerSupabaseClient } from '@/lib/supabase-server'

    async function getSiteSettings() {
      const supabase = createServerSupabaseClient()
      const { data } = await supabase
        .from('site_settings')
        .select('logo_url, social_links, primary_color_rgb, background_color_rgb')
        .single()
      return data
    }

    export default async function RootLayout({ children }: { children: React.ReactNode }) {
      const settings = await getSiteSettings()

      return (
        <html lang="en">
          <head>
            <style>{\`:root{--color-primary:\${settings?.primary_color_rgb ?? '26 58 92'};--color-background:\${settings?.background_color_rgb ?? '248 250 252'}}\`}</style>
          </head>
          <body>
            <header>
              {settings?.logo_url && (
                <img src={settings.logo_url} alt="Logo" className="h-10 object-contain" />
              )}
              {/* ...nav... */}
            </header>
            {children}
            <footer>
              {settings?.social_links?.instagram && (
                <a href={settings.social_links.instagram} target="_blank" rel="noopener noreferrer">Instagram</a>
              )}
              {settings?.social_links?.facebook && (
                <a href={settings.social_links.facebook} target="_blank" rel="noopener noreferrer">Facebook</a>
              )}
              {/* only render a link for keys that are actually present in social_links */}
              {/* Required, non-configurable — see rule 15 */}
              <p className="text-center text-xs text-gray-400 py-4">
                Built by{' '}
                <a href="https://vision-workx.vercel.app" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">Vision Workx</a>{' '}
                by Revalor
              </p>
            </footer>
          </body>
        </html>
      )
    }
    \`\`\`

13. CRITICAL — the app's primary/background colors are runtime-configurable, exactly like the logo and social links in rule 12 (same site_settings mechanism, same single fetch — do not add a second query). Because of that:
    - NEVER write a literal hex color anywhere in your code — no \`bg-[#1A3A5C]\`, no \`text-[#F8FAFC]\`, no inline \`style={{ color: '#...' }}\`, no hex string embedded in ANY Tailwind arbitrary-value class (\`bg-[...]\`, \`text-[...]\`, \`border-[...]\`, \`ring-[...]\`, \`from-[...]\`, \`via-[...]\`, \`to-[...]\`).
    - Use ONLY the Tailwind theme utility classes \`primary\` and \`background\` for all brand-color usage: \`bg-primary\`, \`text-primary\`, \`border-primary\`, \`hover:bg-primary/90\`, \`bg-primary/10\`, \`bg-background\`, etc. The \`/NN\` opacity-modifier syntax works normally on these — use it instead of a different literal color for hover/muted/subtle states.
    - \`tailwind.config.ts\` is platform-owned — it already maps \`primary\`/\`background\` to CSS variables for you. Do NOT create, edit, or rely on your own \`tailwind.config.ts\` content; anything you write there (colors, fonts, plugins) will be discarded and replaced before deploy. Apply your chosen font via the font object's \`.className\` directly on \`<html>\`/\`<body>\` — never via a tailwind.config fontFamily extension.
    - You do NOT need to know the actual color values, ever. Build entirely color-value-agnostic UI using only the \`primary\`/\`background\` theme names — the platform supplies the real values at runtime via the \`<style>\` tag already shown in rule 12's required pattern above.

14. CRITICAL — the business's photo gallery ("Our Recent Work") is runtime-configurable content in the same \`site_settings\` row rule 12 describes, in a \`gallery_photos\` column: a JSON array of full public image URLs (already-hosted — use directly as an \`<img src>\`, never transform, resize, or re-host them). This is the ONE exception to rule 12's single-fetch rule, because this content is homepage-specific, not global layout chrome:
    - Fetch \`gallery_photos\` in \`app/page.tsx\` ONLY (the public homepage) — nowhere else. NEVER add this query to \`app/layout.tsx\` or any other page/component.
    - \`app/page.tsx\` MUST also include \`export const dynamic = 'force-dynamic'\`.
    - Select ONLY the \`gallery_photos\` column here — never re-select \`logo_url\`/\`social_links\`/color columns, those already came from the layout fetch.
    - If the array is empty (or the fetch returns null), render NOTHING — no section heading, no placeholder grid, no empty state. Most generated apps start with zero gallery photos.
    - Give each \`<img>\` a generic, distinguishing alt text of the form \`"Recent project photo \${index + 1}"\` (1-indexed) — there is no per-photo caption stored, never invent one, never reuse identical alt text across images.

    Required pattern:
    \`\`\`typescript
    // app/page.tsx
    export const dynamic = 'force-dynamic'

    import { createServerSupabaseClient } from '@/lib/supabase-server'

    async function getGalleryPhotos() {
      const supabase = createServerSupabaseClient()
      const { data } = await supabase
        .from('site_settings')
        .select('gallery_photos')
        .single()
      return (data?.gallery_photos as string[] | undefined) ?? []
    }

    export default async function HomePage() {
      const galleryPhotos = await getGalleryPhotos()

      return (
        <>
          {/* ...rest of homepage... */}
          {galleryPhotos.length > 0 && (
            <section aria-label="Our recent work">
              <h2>Our Recent Work</h2>
              <div className="grid grid-cols-3 gap-4">
                {galleryPhotos.map((url, index) => (
                  <img
                    key={url}
                    src={url}
                    alt={\`Recent project photo \${index + 1}\`}
                    className="w-full aspect-square object-cover rounded-lg"
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )
    }
    \`\`\`

15. CRITICAL — every page of this app must carry a small "Built by Vision Workx" credit in the footer. Put it ONCE in \`app/layout.tsx\` (inside the shared \`<footer>\` from rule 12's pattern, after the social links) so it renders on every route automatically. Exact markup — text link, NO logo/image:
    \`\`\`tsx
    <p className="text-center text-xs text-gray-400 py-4">
      Built by{' '}
      <a href="https://vision-workx.vercel.app" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">
        Vision Workx
      </a>{' '}
      by Revalor
    </p>
    \`\`\`
    Do not remove it, hide it, or route it through \`site_settings\`. It is not configurable. Keep it visually quiet (small, muted) but present and legible on light and dark backgrounds.`;

// ---------------------------------------------------------------
// POST /api/generate
// ---------------------------------------------------------------
export async function POST(req: NextRequest) {
  // A preview generation (Phase 5b) is triggered server-to-server with the
  // service-role key and has no session; everything else needs one.
  const isPreview =
    (req.headers.get("authorization") ?? "") ===
    `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`;

  let userId: string | null = null;
  if (!isPreview) {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
  }

  let body: { appId?: string; _preview?: boolean; _autoRetry?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const appId: string = body.appId ?? "";
  if (!appId) {
    return NextResponse.json({ error: "Missing appId" }, { status: 400 });
  }

  // Fetch app record — service client bypasses RLS, ownership verified by
  // the user_id filter (skipped for a preview, which has no owner yet).
  const serviceClient = createServiceClient();
  let appQuery = serviceClient.from("apps").select("*").eq("id", appId);
  if (!isPreview) appQuery = appQuery.eq("user_id", userId!);
  const { data: app, error: appError } = await appQuery.single();

  if (appError || !app) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  if (!app.intake_data) {
    return NextResponse.json({ error: "Missing intake data" }, { status: 400 });
  }

  // Already generated / mid-pipeline / live — never silently regenerate
  // (a /generate page refresh remounts the client and would otherwise
  // kick a second build over a working one).
  if (app.status === "ready" || app.status === "deploying" || app.status === "deployed") {
    return NextResponse.json({ error: "App already generated" }, { status: 409 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const intake = app.intake_data as IntakeData;
  const userPrompt = buildUserPrompt(intake);
  const appCategory = app.category as AppCategory;
  const appCategories = [
    appCategory,
    ...((app.secondary_categories ?? []) as AppCategory[]),
  ];
  const appName = app.name;

  // Tee pattern: stream to client while accumulating for Supabase
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  let fullText = "";

  // Runs concurrently with the streaming response.
  // writer.close() only called after Supabase save, so the HTTP response
  // stays open until the save completes — client gets done=true post-save.
  async function streamAndSave() {
    // The client is shown coarse phases only — never the generated code, never
    // repair details. The stream carries `[[PHASE:x]]` markers and `[[TICK]]`
    // heartbeats; GenerateClient parses those and ignores everything else.
    // (docs/stabilization-plan.md — client-exposure work)
    const phase = async (name: "designing" | "building" | "reviewing") => {
      if (!isPreview) await writer.write(encoder.encode(`[[PHASE:${name}]]\n`));
    };
    try {
      await phase("designing");

      // Pass 1: a cheap plan (file manifest + schema) the model commits to
      // before writing ~100KB of code — cuts mid-stream drift and dropped
      // files, and gives validateGenerated a manifest to check against.
      let planFiles: string[] = [];
      let planBlock = "";
      try {
        const plan = await generatePlan(intake, appId);
        planFiles = plan.files;
        planBlock = `\n\n## Agreed build plan — implement EXACTLY this, every file, nothing dropped\n${plan.text}\n`;
      } catch (err) {
        console.error("[/api/generate] plan pass failed, continuing without it:", err);
      }

      // Pass 2: implement.
      await phase("building");
      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-6",
        // A real multi-page app runs past 32k output tokens; 64k is the
        // Sonnet ceiling. maxDuration below allows the longer stream.
        max_tokens: 64000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt + planBlock }],
      });

      // The generated code never reaches the browser — only accumulate it.
      // Emit a heartbeat every ~8s so the connection (and any proxy in front
      // of it) stays warm and the client can show liveness.
      let lastTick = Date.now();
      for await (const chunk of stream) {
        if (
          chunk.type === "content_block_delta" &&
          chunk.delta.type === "text_delta"
        ) {
          fullText += chunk.delta.text;
          if (!isPreview && Date.now() - lastTick > 8000) {
            await writer.write(encoder.encode("[[TICK]]\n"));
            lastTick = Date.now();
          }
        }
      }

      const finalMessage = await stream.finalMessage();
      await logAiUsage({
        source: "app_generate",
        model: "claude-sonnet-4-6",
        inputTokens: finalMessage.usage.input_tokens,
        outputTokens: finalMessage.usage.output_tokens,
        appId,
      });

      // Phase 6a: static-check the output (truncation, missing files,
      // unresolved imports, migration-contract gaps) and run a targeted
      // repair pass before saving — much cheaper than a failed deploy or a
      // live app with 404ing detail pages.
      // Normalise on the way in — round-tripping through the parser strips
      // any wrapping markdown code fences the model emitted (a ```sql fence
      // inside a migration has broken real builds).
      const parsed = parseFileMap(fullText);
      let codeToSave = serializeFileMap(parsed);
      const problems = validateGenerated(
        fullText,
        parsed,
        appCategories,
        planFiles,
        intake.features ?? [],
      );
      await phase("reviewing");
      if (problems.length > 0) {
        const { map: repaired, rounds, remaining } = await repairGenerated(
          parsed,
          problems,
          {
            appName,
            category: appCategory,
            categories: appCategories,
            plannedFiles: planFiles,
            features: intake.features ?? [],
            appId,
          },
        );
        codeToSave = serializeFileMap(repaired);
        console.log(
          `[/api/generate] repair: ${problems.length} problem(s), ${rounds} round(s), ${remaining.length} remaining`,
        );
      }

      // An empty / truncated-to-nothing blob must never be persisted as
      // status:"ready" — that's the "generated_code is NULL, status stuck"
      // failure. Fail loud instead. (docs/stabilization-plan.md T0.1)
      if (!codeToSave || codeToSave.length < 200) {
        await serviceClient
          .from("apps")
          .update({
            status: "failed",
            failure_reason: "generation",
            build_notice: DEFAULT_BUILD_NOTICE,
            build_notice_at: new Date().toISOString(),
          })
          .eq("id", appId);
        await notifyBuildFailure({
          stage: "generate",
          appId,
          appName,
          customer: app?.preview_email ?? (app?.user_id ? `user ${app.user_id}` : null),
          error: "generation produced no usable code",
          title: operatorAlertTitle("generation"),
        });
        return;
      }

      // Save generated code — happens while HTTP response is still technically
      // open. First build → generated_code. A regeneration of an app that
      // already has a last-good version → stage in pending_generated_code so a
      // failed rebuild can't destroy the running app's source; a successful
      // deploy promotes it (docs/stabilization-plan.md T0.1).
      const isRegen = Boolean(app?.generated_code);
      await serviceClient
        .from("apps")
        .update(
          isRegen
            ? { pending_generated_code: codeToSave, status: "ready", failure_reason: null }
            : { generated_code: codeToSave, status: "ready", failure_reason: null },
        )
        .eq("id", appId);

      // Open the app's revision history with this first build (snapshot is
      // the empty map). finalizeRevision in /api/deploy closes it out.
      await recordInitialRevision(appId);

      // Kick off deploy pipeline (fire-and-forget via internal API route).
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vision-workx.vercel.app";
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
      if (codeToSave) {
        fetch(`${appUrl}/api/deploy`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ appId, _internal: true }),
        }).catch((err: unknown) =>
          console.error("[api/generate] deploy trigger failed:", err)
        );
      }
    } catch (err) {
      console.error("[/api/generate] stream error:", err);
      const errMsg = err instanceof Error ? err.message : String(err);
      const reason = classifyBuildError(errMsg);

      // One automatic retry for the flaky classes (a bad model run, a
      // transient overload) before the customer ever sees "failed" — the
      // app stays in `generating`, the client keeps polling, and the retry
      // runs in its own fresh function invocation / time budget.
      const retryable =
        reason === "generation" ||
        reason === "anthropic_overloaded" ||
        reason === "anthropic_rate_limit";
      if (retryable && !body._autoRetry) {
        console.warn(`[/api/generate] auto-retrying once after ${reason}`);
        if (reason !== "generation") await new Promise((r) => setTimeout(r, 8000));
        const origin = process.env.NEXT_PUBLIC_APP_URL || "https://vision-workx.vercel.app";
        void fetch(`${origin}/api/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
          },
          body: JSON.stringify({ appId, _preview: isPreview, _autoRetry: true }),
        }).catch((e) => console.error("[/api/generate] auto-retry trigger failed:", e));
        return; // leave status as-is; the retry owns the outcome
      }

      try {
        await serviceClient
          .from("apps")
          .update({
            status: "failed",
            failure_reason: reason,
            build_notice: DEFAULT_BUILD_NOTICE,
            build_notice_at: new Date().toISOString(),
          })
          .eq("id", appId);
      } catch (saveErr) {
        console.error("[/api/generate] failed to update status:", saveErr);
      }
      await notifyBuildFailure({
        stage: "generate",
        appId,
        appName,
        customer: app?.preview_email ?? (app?.user_id ? `user ${app.user_id}` : null),
        error: `${errMsg}${body._autoRetry ? " (this was already the automatic retry)" : ""}`,
        title: operatorAlertTitle(reason),
      });
    } finally {
      try {
        await writer.close();
      } catch {
        // Writer may already be closed if client disconnected
      }
    }
  }

  // Preview (Phase 5b): no client holds this request open. Respond 202
  // immediately (so the caller's awaited fetch doesn't hit undici's
  // headers timeout) and do the whole generate → validate → repair →
  // deploy in this function's own `after()`, which keeps the lambda alive
  // up to maxDuration.
  if (isPreview) {
    after(() => streamAndSave());
    return NextResponse.json({ ok: true, accepted: true }, { status: 202 });
  }

  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  streamAndSave();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// ---------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------
const CATEGORY_DESCRIPTIONS: Record<AppCategory, string> = {
  booking: "booking and appointment scheduling system",
  crm: "customer relationship management (CRM) system",
  inventory: "inventory and order management system",
  portal: "client portal with document sharing and messaging",
  invoicing: "invoicing and quote management system",
  membership: "membership and recurring billing management system",
  storefront: "online store — product catalogue, cart, checkout, and orders",
};

export function buildUserPrompt(intake: IntakeData): string {
  const secondary = (intake.secondaryCategories ?? []).filter(
    (c) => c !== intake.category,
  );
  const categoryDesc =
    (CATEGORY_DESCRIPTIONS[intake.category] ?? intake.category) +
    (secondary.length
      ? ` that ALSO works as a ${secondary
          .map((c) => CATEGORY_DESCRIPTIONS[c] ?? c)
          .join(" and a ")}`
      : "");

  const secondarySection = secondary.length
    ? `

## Secondary capabilities (required — this is one app that does all of the below)
Build the primary category above, and ALSO fully include:
${secondary
  .map(
    (c) =>
      `- ${CATEGORY_DESCRIPTIONS[c] ?? c}: its core pages, its own tables in the same migration, and its rows in vw_metrics_daily / vw_automation_due (use that category's metric_key / trigger_type names).`,
  )
  .join("\n")}
Share auth, layout, navigation, and the customer/contact records across all capabilities — this is a single unified app, not several bolted together.`
    : "";

  const featureLines =
    intake.features.length > 0
      ? intake.features.map((f) => `- ${f}`).join("\n")
      : "- Core features for this category";

  const wantsLocation = intake.features.includes(LOCATION_FEATURE);
  const locationSection = wantsLocation
    ? `

## Location & Directions (required — selected as a feature)
- Map query address: "${intake.location || `${intake.businessName}, ${intake.businessType}`}" (fall back to business name + type if no location was given)
- Embed a Google Map of the business address using a plain iframe embed — no API key required: \`https://www.google.com/maps?q=<url-encoded address>&output=embed\`
- Add a prominent "Get Directions" button linking to \`https://www.google.com/maps/dir/?api=1&destination=<url-encoded address>\`
- Use the browser's \`navigator.geolocation\` API to optionally show the customer how far away they are (e.g. "3.2 miles away"), with a graceful fallback (hide it) if permission is denied or unavailable
- Place this on the public-facing page(s), not just the admin dashboard`
    : "";

  const wantsBilingual = intake.features.includes(BILINGUAL_FEATURE);
  const bilingualSection = wantsBilingual
    ? `

## Bilingual English/Spanish (required — selected as a feature)
- Write out full English AND Spanish copy yourself for every user-facing string — do NOT call any translation API or service at runtime, there is no translation budget
- Store both languages in a single static dictionary (e.g. \`lib/i18n.ts\` exporting \`{ en: {...}, es: {...} }\`) and a small \`LanguageContext\`/\`useLanguage()\` hook that reads/writes the chosen language to localStorage
- Add an "EN / ES" toggle in the navbar/header visible on both the customer-facing pages and the admin dashboard
- Default to English; the toggle swaps all visible copy instantly with no page reload and no network request`
    : "";

  const wantsQrCode = intake.features.includes(QR_CODE_FEATURE);
  const qrCodeSection = wantsQrCode
    ? `

## QR Code (required — selected as a feature)
- Add the \`qrcode\` npm package as a dependency (free, generates codes locally, no API key or network call needed) and use it to render a QR code as a PNG data URL
- Point the QR code at the app's main public-facing URL (the public booking page, or the portal/customer login page if there's no public page)
- Show it on the admin dashboard with a short caption and a "Download QR Code" button, so the business owner can print it for their storefront, flyers, or receipts`
    : "";

  const wantsCalendarExport = intake.features.includes(CALENDAR_EXPORT_FEATURE);
  const calendarExportSection = wantsCalendarExport
    ? `

## Add to Calendar (required — selected as a feature)
- For each upcoming appointment/follow-up, generate a downloadable \`.ics\` file (iCalendar format) client-side — this is plain text generation, no API or package needed
- Add an "Add to Calendar" button next to each upcoming appointment/reminder that downloads the .ics file, including title, date/time, location (if available), and a short description
- Works for both the customer-facing confirmation and the admin view`
    : "";

  const wantsTeam = intake.features.includes(TEAM_ACCESS_FEATURE);
  const teamSection = wantsTeam
    ? `

## Staff logins & team invites (required — selected as a feature)
The business owner needs to give staff their own logins to the admin area.
- Migration: a \`team_members\` table — \`id uuid primary key default gen_random_uuid()\`, \`email text not null unique\`, \`role text not null default 'staff' check (role in ('owner','staff'))\`, \`invite_token text unique\`, \`invited_at timestamptz not null default now()\`, \`joined_at timestamptz\`, \`user_id uuid references auth.users(id)\`. RLS on; a team member may select the table, only \`role='owner'\` rows may insert/update/delete.
- Signup: right after \`supabase.auth.signUp()\` succeeds, if \`team_members\` is empty, insert this user as \`role='owner'\` with \`joined_at = now()\` and their \`user_id\`. (Foreign keys to \`auth.users\` are fine; no trigger on \`auth.users\`.)
- Admin **Team** page (\`app/team/page.tsx\`, owner-only): lists members with role + status (Invited / Active); an "Invite teammate" form that inserts a \`team_members\` row (\`role='staff'\`, a random \`invite_token\`) and shows a **copyable invite link** \`<app origin>/join?token=<invite_token>\` — do NOT send an email, the owner shares the link; a "Remove" button per member (owner-only, can't remove the last owner).
- \`app/join/page.tsx\`: reads \`?token\`, looks up the un-joined \`team_members\` row, shows an email (read-only, from the row) + set-password form → \`supabase.auth.signUp()\` → on success set that row's \`user_id\` and \`joined_at = now()\`, clear \`invite_token\`, redirect to the admin area. Invalid/used token → a friendly "This invite link is no longer valid" message.
- Access gating: EVERY admin page must, server-side, confirm the signed-in user's id is in \`team_members\` with \`joined_at is not null\` — otherwise \`redirect('/login')\`. Owner-only actions (this Team page, billing/plan changes, deleting records) additionally require \`role='owner'\`.
- The customer-facing pages are unchanged — this is admin-side only.`
    : "";

  const storefrontSection = intake.category === "storefront"
    ? `

## Online store (this IS the app — build all of it)

### Tables (in your migration, tenant schema — no variants in this version)
\`\`\`sql
create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  price_cents integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  url text not null,
  position integer not null default 0
);
create table store_settings (
  id boolean primary key default true check (id),
  shipping_flat_cents integer not null default 0,
  free_shipping_over_cents integer,            -- null = never free
  currency text not null default 'usd',
  admin_emails text[] not null default '{}'    -- who may open /admin (seeded by the platform post-deploy)
);
insert into store_settings (id) values (true) on conflict do nothing;
create table orders (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  items jsonb not null,                         -- [{product_id, name, qty, unit_cents}]
  subtotal_cents integer not null,
  shipping_cents integer not null default 0,
  total_cents integer not null,
  ship_name text, ship_address text, ship_city text, ship_state text, ship_zip text,
  status text not null default 'pending' check (status in ('pending','new','packed','shipped','cancelled')),
  stripe_session_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
\`\`\`
RLS (this app has NO service-role key — every server route uses the anon key, so a shopper is the \`anon\` role even from a server action; get these exactly right or checkout breaks):
- \`products\` / \`product_images\` / \`store_settings\` — \`select\` to \`anon, authenticated\`; \`insert/update/delete\` to \`authenticated\` only.
- \`orders\` — a shopper (anon) must be able to place and then complete their own order, but never read other people's:
  - \`insert\` to \`anon, authenticated\` with \`with check (status = 'pending')\`
  - \`update\` to \`anon, authenticated\` with \`using (status = 'pending')\` (so the /store/success route can flip a pending order to paid, but nothing shipped can be touched)
  - \`select\` and \`delete\` to \`authenticated\` only (the store owner's admin)
Seed 6–8 realistic \`products\` with \`active = true\` and one \`product_images\` row each (use \`https://picsum.photos/seed/<slug>/600/600\` as placeholder URLs) so the store looks stocked on first run.

### Customer pages
- \`app/page.tsx\` → redirect to \`/store\` (or make \`/store\` the homepage). Public, no auth.
- \`/store\` — product grid: first image, name, price (\`price_cents/100\`). Only \`active\` products. Empty state if none.
- \`/store/[slug]\` — image gallery (all \`product_images\` ordered by \`position\`), name, price, description, quantity, **Add to cart**.
- \`/cart\` — reads the cart from \`localStorage\` (key \`"cart"\`, shape \`[{product_id, qty}]\`); fetches those products fresh for name/price/image; shows line items with qty steppers, subtotal, a shipping line computed from \`store_settings\` (\`shipping_flat_cents\`, waived when subtotal ≥ \`free_shipping_over_cents\`), and total. A short **ship-to form** (name, address, city, state, zip, email) then a **Checkout** button. The page's SERVER component reads \`process.env.STRIPE_CHECKOUT_URL\` and passes a \`paymentsEnabled\` boolean to the client — when false, the Checkout button is disabled and shows "This store isn't accepting online payments yet."
- \`/store/success\` — reads \`?order_id\` and \`?session_id\`; server-confirms payment (below); on success shows the order + items and clears the cart client-side.

Cart is \`localStorage\` ONLY — never a DB table. The server re-reads every price from \`products\` at checkout; never trust prices sent from the browser.

TypeScript: when you build the cart's display rows by mapping cart items to their product and skipping ones whose product isn't found, the map returns \`(Row | null)[]\`. NEVER assign that to \`Row[]\` — finish the chain with \`.filter((r): r is Row => r != null)\`. This is the #1 cause of a failed storefront build.

### Checkout (server route / server action only)
0. FIRST check \`process.env.STRIPE_CHECKOUT_URL\` and \`process.env.APP_CHECKOUT_SECRET\`. If EITHER is missing/empty, return \`{ error: "This store isn't accepting online payments yet." }\` and do NOT create an order. The \`/cart\` page shows that message inline and disables the Checkout button — never "Failed to create order", never a throw.
1. Recompute subtotal + shipping from the DB and \`store_settings\`.
2. Insert an \`orders\` row: \`status='pending'\`, \`items\` = \`[{product_id, name, qty, unit_cents}]\`, the ship-to fields, \`email\`. (The anon insert policy above allows this only when \`status = 'pending'\`.)
3. POST \`process.env.STRIPE_CHECKOUT_URL\` with header \`x-vw-checkout-secret: process.env.APP_CHECKOUT_SECRET\`:
\`\`\`ts
body: JSON.stringify({
  mode: "payment",
  lineItems: [
    ...items.map(i => ({ name: i.name, amountCents: i.unit_cents, quantity: i.qty, imageUrl: i.image_url })),
    ...(shipping_cents > 0 ? [{ name: "Shipping", amountCents: shipping_cents, quantity: 1 }] : []),
  ],
  currency: storeSettings.currency,
  successUrl: "https://YOUR_APP_URL/store/success?order_id=" + order.id + "&session_id={CHECKOUT_SESSION_ID}",
  cancelUrl: "https://YOUR_APP_URL/cart?cancelled=1",
  metadata: { order_id: order.id },
})
\`\`\`
Use the literal \`{CHECKOUT_SESSION_ID}\`; derive \`YOUR_APP_URL\` from the request URL. Redirect the customer to the returned \`url\`.
4. On \`/store/success\` (server): GET \`\${process.env.STRIPE_CHECKOUT_URL}?session_id=<the session id>\` with the same \`x-vw-checkout-secret\` header → \`{ paid }\`. If \`paid\` and the order is still \`pending\`: set \`status='new'\`, \`paid_at=now()\`, \`stripe_session_id\`. Idempotent — a second visit must not double-anything.
- If \`STRIPE_CHECKOUT_URL\` or \`APP_CHECKOUT_SECRET\` is missing/empty: the catalogue still renders, but the cart's Checkout button is replaced with a disabled "The store isn't accepting payments yet" note. Never a dead button, never a throw.

### Product images — upload (server-side only)
The admin uploads product photos through your OWN route (never expose \`APP_CHECKOUT_SECRET\` to the browser). Add \`app/api/upload/route.ts\`:
\`\`\`ts
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const out = new FormData();
  out.append("file", file as Blob);
  const r = await fetch(process.env.PRODUCT_IMAGE_UPLOAD_URL!, {
    method: "POST",
    headers: { "x-vw-checkout-secret": process.env.APP_CHECKOUT_SECRET! },
    body: out,
  });
  return Response.json(await r.json());   // { url } | { error }
}
\`\`\`
Admin image pickers POST the file to \`/api/upload\` and store the returned \`url\` in \`product_images\`. If \`PRODUCT_IMAGE_UPLOAD_URL\` is missing, show a disabled "image upload isn't available" state.

### Admin (allowlist-gated — auth.users is shared across every store)
Being logged in is NOT enough. In \`app/admin/layout.tsx\` (server), after \`supabase.auth.getUser()\`: read \`store_settings.admin_emails\` and if the user's email is not in that array, \`redirect('/login?denied=1')\`. Do the same guard at the top of EVERY \`app/api/admin/*\` route and return \`403\` if it fails. \`/login\` shows "That account isn't an admin for this store." when \`?denied=1\`. (The platform seeds \`admin_emails\` with the owner's address after deploy; the Settings page may add/remove more.)
- Nav: **Products · Orders · Payments · Settings**
- \`/admin/products\` — list (thumb, name, price, active toggle, delete). "Add product" → form: name, description, price (dollars input → store cents), active; a multi-image picker (upload → \`product_images\`, drag or ▲▼ to set \`position\`). Editing a product edits the same fields.
- \`/admin/orders\` — list newest first (date, email, item count, total, status badge). Row → items table, ship-to block, and a status \`<select>\` \`new → packed → shipped\` (also \`cancelled\`). \`pending\` orders (payment never completed) show greyed with no actions.
- \`/admin/payments\` — the live Stripe history from \`process.env.STRIPE_TRANSACTIONS_URL\` (see the "Payments history" block in the Payments section: date / customer / description / amount / status / receipt, "Load more").
- \`/admin/settings\` (store) — edit \`store_settings\`: flat shipping (dollars), free-shipping threshold (dollars, blank = off), currency (read-only \`usd\` for now), and **Admin users** — the \`admin_emails\` list (add by email, remove; never let the list become empty).

### Reporting
In \`vw_metrics_daily\` emit \`orders_created\` (paid orders per day, by \`paid_at::date\`), \`units_sold\` (sum of item qty on paid orders), \`revenue_cents\` (sum of \`total_cents\` on paid orders). Do NOT emit metrics for \`pending\` orders.`
    : "";

  const paymentsSection = [intake.category, ...secondary].some(categoryTakesPayments)
    ? `

## Payments — this app collects real money (required)
The business charges its customers through **its own Stripe account**. Two SERVER-side env vars are provided, but ONLY after the owner connects Stripe from VisionWorkx — treat both as optional and possibly empty:
- \`process.env.STRIPE_CHECKOUT_URL\` — POST here to create a Stripe Checkout session
- \`process.env.STRIPE_TRANSACTIONS_URL\` — GET here for the payment history (see "Payments history" below)
- \`process.env.APP_CHECKOUT_SECRET\` — send it as the \`x-vw-checkout-secret\` request header

Rules:
- If either var is missing/empty, render every payment control in a clearly labelled "Payments aren't set up yet" **disabled** state. Never throw, never show a dead button. For \`booking\`, in that case just skip the deposit step and confirm bookings directly.
- NEVER call Stripe directly and NEVER put a Stripe key anywhere in this app. All money flows through \`STRIPE_CHECKOUT_URL\`.
- Create the session and confirm payment ONLY from server routes / server actions, never client-side.

Create a session:
\`\`\`ts
const res = await fetch(process.env.STRIPE_CHECKOUT_URL!, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-vw-checkout-secret": process.env.APP_CHECKOUT_SECRET! },
  body: JSON.stringify({
    mode: "payment",                 // or "subscription"
    amount: 4999,                    // integer cents (mode "payment", or "subscription" with no priceId)
    currency: "usd",
    interval: "month",               // mode "subscription" only
    productName: "Invoice #1024",
    successUrl: "https://YOUR_APP_URL/pay/success?recordId=1024&session_id={CHECKOUT_SESSION_ID}",
    cancelUrl: "https://YOUR_APP_URL/pay/cancelled?recordId=1024",
    metadata: { recordId: "1024" },
  }),
});
const { url } = await res.json();     // redirect the customer to \`url\`
\`\`\`
Put the literal string \`{CHECKOUT_SESSION_ID}\` in \`successUrl\` — Stripe substitutes the real id. Derive \`YOUR_APP_URL\` from the incoming request URL, do not hardcode it.

Confirm before marking anything paid (server-side, on the success route):
\`\`\`ts
const r = await fetch(\`\${process.env.STRIPE_CHECKOUT_URL}?session_id=\${sessionId}\`, {
  headers: { "x-vw-checkout-secret": process.env.APP_CHECKOUT_SECRET! },
});
const { paid, metadata } = await r.json();
if (paid) { /* mark the record paid in the tenant DB */ }
\`\`\`

Payments history (required when payments are set up) — an admin-only "Payments" page that lists what the business has actually been paid. It is a LIVE read from Stripe, never a local table:
\`\`\`ts
// server component / server route, admin-gated
const r = await fetch(\`\${process.env.STRIPE_TRANSACTIONS_URL}?limit=50\`, {
  headers: { "x-vw-checkout-secret": process.env.APP_CHECKOUT_SECRET! },
  cache: "no-store",
});
const { transactions, hasMore } = await r.json();
// transactions: { id, created (unix s), amount (cents), currency, status,
//   paid, refunded, amountRefunded (cents), description, customerEmail, receiptUrl }[]
\`\`\`
- Add it to the admin dashboard nav as "Payments". Table columns: date, customer (email or "—"), description, amount (\`amount/100\` in \`currency\`), status badge (Paid / Pending / Failed; show "Refunded" when \`refunded\`, or "Partial refund" when \`0 < amountRefunded < amount\`), and a "Receipt" link when \`receiptUrl\` is present.
- "Load more" passes \`?starting_after=<last transaction id>\` when \`hasMore\`.
- If \`STRIPE_TRANSACTIONS_URL\` / \`APP_CHECKOUT_SECRET\` are missing, or the list is empty, show the same "Payments aren't set up yet" / "No payments yet" empty state — never an error.
- Never call Stripe directly from this page and never expose \`APP_CHECKOUT_SECRET\` to the browser.

Category specifics:
- **invoicing** — a "Pay this invoice" button on each unpaid invoice (\`mode: "payment"\`, \`amount\` = invoice total in cents). Mark it paid only after the server confirms the session.
- **membership** — each plan tier is \`mode: "subscription"\` with \`amount\` (cents) + \`interval\`. Record the member active once confirmed.
- **booking** — an optional deposit at booking time (\`mode: "payment"\`, \`amount\` = deposit). The booking stays "pending" until the deposit is confirmed.
- **storefront** — do NOT use \`amount\`; use \`lineItems\` (a cart). Full flow is in the "Online store" section above.`
    : "";

  const reportingSection = `

## Reporting view (required — powers the owner's Insights dashboard)
In the migration, after your tables, create a VIEW named exactly \`vw_metrics_daily\` with columns \`day\` (date), \`metric_key\` (text), \`value\` (numeric) — one row per day per metric, for activity in the last 180 days. Base \`day\` on the relevant timestamp column cast to \`::date\`.
Only emit \`metric_key\` values whose underlying table you actually created. Do NOT invent metric names — use exactly these:
- booking:    \`bookings_created\`, \`bookings_completed\`, \`bookings_cancelled\`, \`bookings_no_show\`, \`revenue_cents\`
- crm:        \`leads_created\`, \`leads_converted\`, \`notes_added\`
- inventory:  \`orders_created\`, \`orders_fulfilled\`, \`items_low_stock\`, \`revenue_cents\`
- portal:     \`documents_shared\`, \`messages_sent\`, \`active_clients\`
- invoicing:  \`invoices_sent\`, \`invoices_paid\`, \`quotes_created\`, \`revenue_cents\`
- membership: \`members_new\`, \`members_churned\`, \`members_active\`, \`revenue_cents\`
- storefront: \`orders_created\`, \`units_sold\`, \`revenue_cents\`
\`revenue_cents\` = SUM of amounts actually paid that day, in integer cents (from the payments flow if this app has one; otherwise omit the key entirely).
The view MUST NOT reference any table you didn't create and MUST NOT error on an empty database. Example:
\`\`\`sql
create view vw_metrics_daily as
  select created_at::date as day, 'bookings_created'::text as metric_key, count(*)::numeric as value
    from bookings where created_at >= now() - interval '180 days' group by 1
  union all
  select updated_at::date, 'bookings_no_show', count(*)::numeric
    from bookings where status = 'no_show' and updated_at >= now() - interval '180 days' group by 1;
\`\`\`

## Automations view (required)
Also create a VIEW named exactly \`vw_automation_due\` with columns \`trigger_type\` (text), \`ref_id\` (text), \`recipient_email\` (text, nullable), \`recipient_phone\` (text, nullable), \`context\` (jsonb). It returns rows that are **due for a time-based message right now** — an hourly job reads it and only ever sends once per (trigger_type, ref_id). Include only the trigger types that apply to this category and whose tables you built:
- \`booking.reminder_24h\` — an appointment 23–25 hours from now that isn't cancelled. context: \`{ starts_at, service }\`.
- \`booking.completed\` — a completed appointment that finished 23–25 hours ago. context: \`{}\`.
- \`lead.stale_3d\` — a lead created 3–4 days ago still in a "new"/open state. context: \`{}\`.
- \`invoice.overdue\` — an unpaid invoice whose due date passed 1–2 days ago. context: \`{ amount_cents }\`.
- \`quote.stale_5d\` — a quote created 5–7 days ago still pending. context: \`{ amount_cents }\`.
Pull \`recipient_email\` / \`recipient_phone\` from whatever contact columns your tables have (so store the customer's email, and phone where relevant, on bookings / leads / invoices / quotes). The view must be safe on an empty database and reference only tables you created. Example:
\`\`\`sql
create view vw_automation_due as
  select 'booking.reminder_24h'::text as trigger_type, b.id::text as ref_id,
         b.customer_email as recipient_email, b.customer_phone as recipient_phone,
         jsonb_build_object('starts_at', b.starts_at, 'service', b.service_name) as context
    from bookings b
   where b.status <> 'cancelled'
     and b.starts_at between now() + interval '23 hours' and now() + interval '25 hours';
\`\`\``;

  return `Build a complete ${categoryDesc} for the following business.

## Business Details
- **Name:** ${intake.businessName}
- **Type:** ${intake.businessType}${intake.location ? `\n- **Location:** ${intake.location}` : ""}${
    intake.description ? `\n- **Description:** ${intake.description}` : ""
  }

## App Category
${intake.category}${secondary.length ? ` (+ ${secondary.join(", ")})` : ""}

## Required Features
${featureLines}${secondarySection}${locationSection}${bilingualSection}${qrCodeSection}${calendarExportSection}${teamSection}${storefrontSection}${paymentsSection}${reportingSection}

## Branding
- Primary/background colors are runtime-configurable — do NOT hardcode any hex color. Use ONLY the \`primary\`/\`background\` Tailwind theme tokens per rule 13 (bg-primary, text-primary, bg-background, hover:bg-primary/90, etc.)
- Font: ${intake.font} (from Google Fonts) — apply via the font object's \`.className\`, never via tailwind.config
- Logo and social media links: read from \`site_settings\` at runtime per rule 12 — do NOT hardcode a logo URL or social link here or anywhere else

## Additional Requirements
- Include both a customer-facing view AND an admin dashboard
- Admin dashboard: manage all records, view stats, handle the core workflow
- Customer view: self-service features relevant to the category
- Use ${intake.font} from Google Fonts via next/font/google
- Keep the UX simple and welcoming — the business owner is not technical
- Include placeholder/mock data so the app looks populated on first run

Generate every file needed for a complete, deployable application.`;
}
