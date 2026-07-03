import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient, createServiceClient } from "@/lib/supabase";
import type { IntakeData } from "@/lib/database.types";

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
10. CRITICAL — lib/supabase.ts MUST read the schema from env and pass it to both browser and server clients:

\`\`\`typescript
// lib/supabase.ts — exact pattern required
import { createBrowserClient, createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const SCHEMA = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || 'public'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: SCHEMA } }
  )
}

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

The .env.local.example MUST include:
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_SUPABASE_SCHEMA=public`;

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
        max_tokens: 8192,
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

      // Kick off the deploy-app Edge Function (fire-and-forget).
      // The pg_net database trigger is a fallback; this ensures the deploy
      // starts even if pg_net is not configured.
      const fnUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/deploy-app`
        : null;
      const fnKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
      if (fnUrl && fnKey && fullText) {
        fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${fnKey}`,
          },
          body: JSON.stringify({ appId }),
        }).catch((err: unknown) =>
          console.error("[api/generate] deploy-app trigger failed:", err)
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
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  booking: "booking and appointment scheduling system",
  crm: "customer relationship management (CRM) system",
  inventory: "inventory and order management system",
  portal: "client portal with document sharing and messaging",
};

function buildUserPrompt(intake: IntakeData): string {
  const categoryDesc =
    CATEGORY_DESCRIPTIONS[intake.category] ?? intake.category;

  const featureLines =
    intake.features.length > 0
      ? intake.features.map((f) => `- ${f}`).join("\n")
      : "- Core features for this category";

  return `Build a complete ${categoryDesc} for the following business.

## Business Details
- **Name:** ${intake.businessName}
- **Type:** ${intake.businessType}${intake.location ? `\n- **Location:** ${intake.location}` : ""}${
    intake.description ? `\n- **Description:** ${intake.description}` : ""
  }

## App Category
${intake.category}

## Required Features
${featureLines}

## Branding
- Primary color: ${intake.primaryColor}
- Font: ${intake.font} (from Google Fonts)

## Additional Requirements
- Include both a customer-facing view AND an admin dashboard
- Admin dashboard: manage all records, view stats, handle the core workflow
- Customer view: self-service features relevant to the category
- Use "${intake.primaryColor}" as the CSS primary color throughout (Tailwind's \`primary\` via config extension or inline hex values)
- Use ${intake.font} from Google Fonts via next/font/google
- Keep the UX simple and welcoming — the business owner is not technical
- Include placeholder/mock data so the app looks populated on first run

Generate every file needed for a complete, deployable application.`;
}
