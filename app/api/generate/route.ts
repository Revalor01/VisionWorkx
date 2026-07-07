import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import type { AppCategory, IntakeData } from "@/lib/database.types";
import {
  LOCATION_FEATURE,
  BILINGUAL_FEATURE,
  QR_CODE_FEATURE,
  CALENDAR_EXPORT_FEATURE,
} from "@/lib/features";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — requires Vercel Pro in production

// ---------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------
const SYSTEM_PROMPT = `You are an expert Next.js 14 and Supabase developer. Generate a complete, production-ready web application based on the business requirements provided.

Output ONLY code files — no explanations, no preamble, no text outside the file blocks. Use this exact format:

[FILENAME: path/to/file.tsx]
<file content here>
[/FILENAME]

Tech stack:
- Next.js 14 App Router, TypeScript throughout
- Supabase for auth + postgres database (@supabase/supabase-js, @supabase/ssr)
- Tailwind CSS for all styling — no external UI component libraries
- next/font/google for the font

Files to generate (minimum):
- app/layout.tsx
- app/page.tsx  (auth-protected main view)
- app/login/page.tsx
- All feature pages for the requested category
- components/ (reusable UI)
- lib/supabase.ts (browser + server clients using @supabase/ssr)
- supabase/migrations/001_init.sql (schema + RLS policies — use gen_random_uuid() not uuid_generate_v4())
- .env.local.example
- README.md (setup instructions for a non-technical user)

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
10. CRITICAL — the browser and server Supabase clients MUST live in TWO SEPARATE files, not one. Mixing them in one file breaks the build, because \`next/headers\` (server-only) can't be imported into any file a Client Component also imports from:

\`\`\`typescript
// lib/supabase.ts — browser client ONLY, exact pattern required
import { createBrowserClient } from '@supabase/ssr'

const SCHEMA = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || 'public'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: SCHEMA } }
  )
}
\`\`\`

\`\`\`typescript
// lib/supabase-server.ts — server client ONLY, exact pattern required
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const SCHEMA = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || 'public'

export function createServerSupabaseClient() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: SCHEMA },
      cookies: {
        get(name) { return cookieStore.get(name)?.value },
        set(name, value, options) { try { cookieStore.set({ name, value, ...options }) } catch {} },
        remove(name, options) { try { cookieStore.set({ name, value: '', ...options }) } catch {} },
      },
    }
  )
}
\`\`\`

Every Server Component, layout, or route handler that needs the server client MUST import \`createServerSupabaseClient\` from \`@/lib/supabase-server\` — NEVER from \`@/lib/supabase\`. Only Client Components ("use client") import \`createClient\` from \`@/lib/supabase\`.

The .env.local.example MUST include:
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_SUPABASE_SCHEMA=public

11. CRITICAL — NEVER write a trigger, function, or any DDL that touches \`auth.users\` or the \`public\` schema in the migration SQL. This app's database is a multi-tenant Postgres project — \`auth.users\` and \`public\` are shared across every tenant, and a trigger like \`on_auth_user_created ON auth.users\` will silently overwrite the platform's own trigger and break signups for every other tenant. This means:
    - Do NOT create a "profile auto-creation" trigger on auth.users. Instead, insert the profile row directly from application code, right after \`supabase.auth.signUp()\` succeeds in the signup page/handler:
      \`\`\`typescript
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (data.user) {
        await supabase.from('profiles').insert({ id: data.user.id, full_name: fullName })
      }
      \`\`\`
    - Foreign keys like \`references auth.users(id)\` are fine and expected — only CREATE/ALTER/DROP statements targeting auth.* or public.* are forbidden
    - All tables you create must live implicitly in the tenant's own schema (the migration runs with search_path already scoped to it) — never schema-qualify a CREATE/ALTER/DROP with \`public.\` or \`auth.\``;

// ---------------------------------------------------------------
// POST /api/generate
// ---------------------------------------------------------------
export async function POST(req: NextRequest) {
  // Auth check via session cookie
  const supabase = createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { appId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const appId: string = body.appId ?? "";
  if (!appId) {
    return NextResponse.json({ error: "Missing appId" }, { status: 400 });
  }

  // Fetch app record — service client bypasses RLS, ownership verified by user_id filter
  const serviceClient = createServiceClient();
  const { data: app, error: appError } = await serviceClient
    .from("apps")
    .select("*")
    .eq("id", appId)
    .eq("user_id", user.id)
    .single();

  if (appError || !app) {
    return NextResponse.json({ error: "App not found" }, { status: 404 });
  }

  if (!app.intake_data) {
    return NextResponse.json({ error: "Missing intake data" }, { status: 400 });
  }

  if (app.status === "ready") {
    return NextResponse.json({ error: "App already generated" }, { status: 409 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const userPrompt = buildUserPrompt(app.intake_data as IntakeData);

  // Tee pattern: stream to client while accumulating for Supabase
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  let fullText = "";

  // Runs concurrently with the streaming response.
  // writer.close() only called after Supabase save, so the HTTP response
  // stays open until the save completes — client gets done=true post-save.
  async function streamAndSave() {
    try {
      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 32000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });

      for await (const chunk of stream) {
        if (
          chunk.type === "content_block_delta" &&
          chunk.delta.type === "text_delta"
        ) {
          const text = chunk.delta.text;
          await writer.write(encoder.encode(text));
          fullText += text;
        }
      }

      // Save generated code — happens while HTTP response is still technically open
      await serviceClient
        .from("apps")
        .update({ generated_code: fullText, status: "ready" })
        .eq("id", appId);

      // Kick off deploy pipeline (fire-and-forget via internal API route).
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://vision-workx.vercel.app";
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
      if (fullText) {
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
      try {
        await serviceClient
          .from("apps")
          .update({ status: "failed" })
          .eq("id", appId);
      } catch (saveErr) {
        console.error("[/api/generate] failed to update status:", saveErr);
      }
    } finally {
      try {
        await writer.close();
      } catch {
        // Writer may already be closed if client disconnected
      }
    }
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
};

function buildUserPrompt(intake: IntakeData): string {
  const categoryDesc =
    CATEGORY_DESCRIPTIONS[intake.category] ?? intake.category;

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

  const logoUrl = intake.logoPath
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/logos/${intake.logoPath}`
    : null;
  const logoLine = logoUrl
    ? `\n- Logo: ${logoUrl} — use this exact URL directly in an <img>/<Image> tag in the header/nav (and anywhere else a logo naturally belongs, e.g. the login page). Do not fetch, download, or re-host it — just reference the URL as-is.`
    : "";
  const backgroundColor = intake.backgroundColor || "#F8FAFC";

  return `Build a complete ${categoryDesc} for the following business.

## Business Details
- **Name:** ${intake.businessName}
- **Type:** ${intake.businessType}${intake.location ? `\n- **Location:** ${intake.location}` : ""}${
    intake.description ? `\n- **Description:** ${intake.description}` : ""
  }

## App Category
${intake.category}

## Required Features
${featureLines}${locationSection}${bilingualSection}${qrCodeSection}${calendarExportSection}

## Branding
- Primary color: ${intake.primaryColor}
- Background color: ${backgroundColor}
- Font: ${intake.font} (from Google Fonts)${logoLine}

## Additional Requirements
- Include both a customer-facing view AND an admin dashboard
- Admin dashboard: manage all records, view stats, handle the core workflow
- Customer view: self-service features relevant to the category
- Use "${intake.primaryColor}" as the CSS primary/accent color throughout (buttons, headings, links — Tailwind's \`primary\` via config extension or inline hex values)
- Use "${backgroundColor}" as the page background color throughout — this is distinct from the primary/accent color above; do not conflate the two
- Use ${intake.font} from Google Fonts via next/font/google
- Keep the UX simple and welcoming — the business owner is not technical
- Include placeholder/mock data so the app looks populated on first run

Generate every file needed for a complete, deployable application.`;
}
