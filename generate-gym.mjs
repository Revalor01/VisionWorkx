import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync } from 'fs';

const env = {};
readFileSync('/Users/revalor-prime/vision-workx/.env.local', 'utf8').split('\n').forEach(line => {
  const [k, ...vs] = line.split('=');
  if (k && vs.length) env[k.trim()] = vs.join('=').trim();
});

const APP_ID = 'e5fcbdd6-95b5-4e1a-9c32-c67d3ceab5ab';
const anthropic = new Anthropic({ apiKey: env['ANTHROPIC_API_KEY'] });

const SYSTEM_PROMPT = `You are an expert Next.js 14 and Supabase developer. Generate a complete, production-ready web application based on the business requirements provided.

Output ONLY code files — no explanations, no preamble, no text outside the file blocks. Use this exact format:

[FILENAME: path/to/file.tsx]
<file content here>
[/FILENAME]

Tech stack:
- Next.js 14 App Router, TypeScript throughout
- Supabase for auth + postgres database (@supabase/ssr)
- Tailwind CSS for all styling — no external UI component libraries
- next/font/google for the font

Files to generate (minimum):
- app/layout.tsx
- app/page.tsx (public home / booking page)
- app/login/page.tsx
- app/admin/page.tsx (admin dashboard)
- components/ (reusable UI)
- lib/supabase.ts (browser client using createBrowserClient from @supabase/ssr)
- supabase/migrations/001_init.sql (use gen_random_uuid(), not uuid_generate_v4())
- .env.local.example
- package.json

Rules:
1. Every admin page must call supabase.auth.getUser() server-side and redirect to /login if unauthenticated
2. All database tables must have RLS enabled
3. Never put secrets in client-side code
4. Loading states on every async action
5. Mobile-first responsive design
6. Simple UX — business owner is not technical
7. Use the provided primary color for buttons, headings, accents
8. Use the provided font throughout
9. Include placeholder/seed data so the app looks populated on first run
10. CRITICAL — lib/supabase.ts must use this exact pattern:
import { createBrowserClient } from '@supabase/ssr';
const SCHEMA = process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || 'public';
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { db: { schema: SCHEMA } });
}`;

const USER_PROMPT = `Build a complete booking and class scheduling app for the following business.

## Business Details
- **Name:** Peak Performance Gym
- **Type:** Fitness center and personal training studio
- **Location:** Dallas, TX
- **Description:** A full-service gym offering group classes, personal training, and open gym access. Open Mon-Sat 5am-10pm, Sun 7am-6pm.

## App Category
booking

## Required Features
- Class scheduling and booking
- Member management
- Personal training session booking
- Public booking page (no login required for customers)
- Admin dashboard (manage classes, trainers, bookings)
- Email confirmations

## Branding
- Primary color: #E85D04 (vibrant orange)
- Font: Montserrat (from Google Fonts)

## Additional Requirements
- Customer-facing: public class schedule, book a class or PT session (name + email + phone)
- Admin: view all bookings, manage class schedule, manage trainers, see member list
- Seed data: 6 class types (Spin, HIIT, Yoga, Boxing, CrossFit, Pilates), 4 trainers, a week of scheduled classes
- Keep UX energetic but clean — gym members range from 18-60 years old

Generate every file needed for a complete, deployable application.`;

console.log('🏋️  Generating Peak Performance Gym app...\n');
let fullText = '';
let lastLog = Date.now();

const stream = anthropic.messages.stream({
  model: 'claude-sonnet-4-6',
  max_tokens: 32000,
  system: SYSTEM_PROMPT,
  messages: [{ role: 'user', content: USER_PROMPT }],
});

stream.on('text', (text) => {
  fullText += text;
  if (Date.now() - lastLog > 4000) {
    const files = (fullText.match(/\[FILENAME:/g) || []).length;
    const lines = fullText.split('\n').length;
    process.stdout.write(`\r   ${lines.toLocaleString()} lines, ${files} files...`);
    lastLog = Date.now();
  }
});

await stream.finalMessage();

const files = (fullText.match(/\[FILENAME:/g) || []).length;
const lines = fullText.split('\n').length;
console.log(`\n\n✅ Generated: ${lines.toLocaleString()} lines, ${files} files`);

// Save locally
const outPath = '/private/tmp/claude-501/-Users-revalor-prime-vision-workx/ee444fd2-f764-4edb-8d86-66afa3dc81d7/scratchpad/gym-generated.txt';
writeFileSync(outPath, fullText);
console.log(`   Saved to ${outPath}`);

// Save to Supabase
const { default: https } = await import('https');
const body = JSON.stringify({ generated_code: fullText, status: 'ready' });
await new Promise((resolve, reject) => {
  const url = new URL(`${env['NEXT_PUBLIC_SUPABASE_URL']}/rest/v1/apps?id=eq.${APP_ID}`);
  const req = https.request({ hostname: url.hostname, path: url.pathname + url.search, method: 'PATCH', headers: {
    'Content-Type': 'application/json', 'apikey': env['SUPABASE_SERVICE_ROLE_KEY'],
    'Authorization': 'Bearer ' + env['SUPABASE_SERVICE_ROLE_KEY'], 'Prefer': 'return=minimal',
    'Content-Length': Buffer.byteLength(body)
  }}, res => { res.on('data', () => {}); res.on('end', resolve); });
  req.on('error', reject);
  req.write(body); req.end();
});
console.log(`   ✓ Saved to Supabase (status → ready)`);
