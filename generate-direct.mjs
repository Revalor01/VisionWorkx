/**
 * Generate the Sunny Day Spa app directly via the Anthropic SDK.
 * Bypasses the Next.js streaming UI and saves directly to Supabase.
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env vars from .env.local
const envPath = '/Users/revalor-prime/vision-workx/.env.local';
const env = {};
readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const [k, ...vs] = line.split('=');
  if (k && vs.length) env[k.trim()] = vs.join('=').trim();
});

const ANTHROPIC_API_KEY = env['ANTHROPIC_API_KEY'];
const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY = env['SUPABASE_SERVICE_ROLE_KEY'];
const APP_ID = '741aa936-5a4d-4d35-a2c8-abafbad7c7e3';

// Use fetch directly to avoid Supabase realtime WebSocket issues in Node 20
async function supabaseUpdate(table, id, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Supabase PATCH failed: ${res.status} ${await res.text()}`);
}

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
- supabase/migrations/001_init.sql (schema + RLS policies)
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
9. Use the provided font throughout (import from next/font/google)`;

const USER_PROMPT = `Build a complete booking and appointment scheduling system for the following business.

## Business Details
- **Name:** Sunny Day Spa
- **Type:** Day spa & wellness center
- **Location:** Austin, TX
- **Description:** We offer massage therapy, facials, and body treatments for individuals and couples. Open Tue–Sun, 9am–7pm.

## App Category
booking

## Required Features
- Online appointment booking
- Staff / resource scheduling
- Public booking page
- Email confirmations
- Admin dashboard

## Branding
- Primary color: #6B4F8E
- Font: Lato (from Google Fonts)

## Additional Requirements
- Include both a customer-facing view AND an admin dashboard
- Admin dashboard: manage all records, view stats, handle the core workflow
- Customer view: self-service features relevant to the category
- Use "#6B4F8E" as the CSS primary color throughout (Tailwind's \`primary\` via config extension or inline hex values)
- Use Lato from Google Fonts via next/font/google
- Keep the UX simple and welcoming — the business owner is not technical
- Include placeholder/mock data so the app looks populated on first run

Generate every file needed for a complete, deployable application.`;

async function main() {
  console.log('🚀 Starting Sunny Day Spa app generation...\n');
  console.log(`   Anthropic key: ${ANTHROPIC_API_KEY?.slice(0, 20)}...`);
  console.log(`   App ID: ${APP_ID}\n`);

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  let fullText = '';
  let tokenCount = 0;
  let lastLog = Date.now();

  console.log('📡 Connecting to Claude API...');

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 32000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: USER_PROMPT }],
  });

  stream.on('text', (text) => {
    fullText += text;
    tokenCount++;
    if (Date.now() - lastLog > 5000) {
      const lines = fullText.split('\n').length;
      const files = (fullText.match(/\[FILENAME:/g) || []).length;
      process.stdout.write(`\r   ${lines.toLocaleString()} lines, ${files} files generated...`);
      lastLog = Date.now();
    }
  });

  stream.on('error', (err) => {
    console.error('\n❌ Anthropic stream error:', err.message);
  });

  await stream.finalMessage();

  const lines = fullText.split('\n').length;
  const files = (fullText.match(/\[FILENAME:/g) || []).length;
  console.log(`\n\n✅ Generation complete!`);
  console.log(`   ${lines.toLocaleString()} lines`);
  console.log(`   ${files} files`);

  // Save to Supabase
  console.log('\n💾 Saving to Supabase...');
  try {
    await supabaseUpdate('apps', APP_ID, { generated_code: fullText, status: 'ready' });
    console.log('   ✓ Saved to apps table (status → ready)');
  } catch (err) {
    console.error('❌ Supabase save error:', err.message);
  }

  // Also save locally
  const outFile = join(__dirname, 'sunny-day-spa-generated.txt');
  writeFileSync(outFile, fullText);
  console.log(`   ✓ Saved locally → ${outFile}`);

  // Print file list
  const fileMatches = [...fullText.matchAll(/\[FILENAME: ([^\]]+)\]/g)];
  console.log(`\n📁 Generated files (${fileMatches.length}):`);
  fileMatches.forEach(m => console.log(`   ${m[1]}`));
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
