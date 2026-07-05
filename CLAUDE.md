# Vision Workx — Claude Code Project File
> A Revalor Company · AI-Powered App Builder for Small Businesses
> Drop this file in your project root. Claude Code reads it automatically every session.

---

## Project Overview

Vision Workx is a SaaS platform that lets small business owners in the United States
describe the app they need in plain English and receive a fully functional, deployed
web application — powered by Claude AI, built on Next.js, and backed by Supabase.

**Core promise:** No code. No agency. Working app in days.

**Target customer:** Non-technical small business owner in the US (salon, gym, consultant,
retailer, clinic) who needs a custom app but can't afford $15,000–$80,000 in agency fees.

---

## Tech Stack

| Layer         | Technology                                      |
|---------------|-------------------------------------------------|
| AI Generation | Anthropic Claude API — claude-sonnet-4-6        |
| Frontend      | Next.js 14 (App Router) + Tailwind CSS          |
| Database      | Supabase (auth + postgres)                      |
| Deployment    | Vercel (auto-deploy via Vercel API)             |
| Billing       | Stripe (subscriptions)                          |
| Email         | Resend (transactional email)                    |

---

## Pricing Tiers

| Tier    | Monthly | Annual   | Apps | Key Features                              |
|---------|---------|----------|------|-------------------------------------------|
| Starter | $49/mo  | $349/yr  | 1    | Subdomain, core features, email support   |
| Growth  | $99/mo  | $699/yr  | 3    | Custom domain, analytics, priority support|
| Pro     | $199/mo | $1399/yr | ∞    | White label, API access, dedicated onboard|

---

## Supabase Schema

```sql
-- Users (extends Supabase auth.users)
create table profiles (
  id uuid references auth.users primary key,
  full_name text,
  company_name text,
  plan text default 'free',
  created_at timestamp default now()
);

-- Generated apps
create table apps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  name text not null,
  category text not null, -- booking | crm | inventory | portal
  status text default 'generating', -- generating | ready | failed
  intake_data jsonb,
  generated_code text,
  deploy_url text,
  created_at timestamp default now()
);

-- Subscriptions
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text, -- starter | growth | pro
  status text, -- active | cancelled | past_due
  current_period_end timestamp,
  created_at timestamp default now()
);
```

---

## Environment Variables

Copy this to `.env.local` and fill in your values:

```bash
# Anthropic
ANTHROPIC_API_KEY=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_STARTER_PRICE_ID=
STRIPE_GROWTH_PRICE_ID=
STRIPE_PRO_PRICE_ID=

# Vercel (for auto-deploying generated apps)
VERCEL_API_TOKEN=
VERCEL_TEAM_ID=

# Resend (email)
RESEND_API_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## App Categories & Prompt Templates

### 1. Booking & Scheduling
Target: salons, clinics, gyms, studios
Features: appointment booking, staff scheduling, public booking page, admin dashboard, email confirmations

### 2. Customer CRM
Target: consultants, coaches, freelancers, agencies
Features: contact list, lead tracking, notes, follow-up reminders, pipeline view

### 3. Inventory & Orders
Target: retailers, cafes, boutiques, makers
Features: stock tracking, order management, low-stock alerts, supplier contacts

### 4. Customer Portal
Target: law firms, accountants, agencies, service providers
Features: client login, document sharing, progress tracking, messaging

### 5. Invoicing & Quotes
Target: contractors, electricians, plumbers, landscapers
Features: quote/estimate builder, one-click invoicing, online payment collection, payment reminders

### 6. Membership Management
Target: gyms, studios, clubs, wellness centers
Features: recurring membership billing, member check-in tracking, plan tiers, auto-renewal

---

## Build Prompts — Run These In Order

### PROMPT 1 — Project Scaffold
```
Build a SaaS platform called Vision Workx using Next.js 14 (App Router),
Supabase, Stripe, Tailwind CSS, and the Anthropic Claude API.

Create the full project structure with:
- / — marketing landing page (hero, how it works section, pricing cards, CTA)
- /login and /signup — Supabase email/password auth
- /dashboard — authenticated user dashboard listing their generated apps
- /onboard — multi-step intake form (business name, type, app category, features, brand colors)
- /generate — app generation page that calls Claude API and streams the response
- /billing — subscription management page
- /api/generate — API route that sends intake data to Claude API using claude-sonnet-4-6
- /api/webhooks/stripe — Stripe webhook handler

Set up Tailwind with a clean, professional design system.
Create .env.local.example with all required environment variables.
Read CLAUDE.md for full project context, schema, and pricing details.
```

### PROMPT 2 — Supabase Schema
```
Create the Supabase schema for Vision Workx using the SQL in CLAUDE.md.
Set up Row Level Security (RLS) policies so users can only read and write
their own data. Create a supabase/migrations/ folder with the SQL files.
Also create a lib/supabase.ts client helper for both server and client components.
```

### PROMPT 3 — Intake Form
```
Build the /onboard multi-step intake form for Vision Workx.
Step 1: Business details (name, type, location, description)
Step 2: App category selection (Booking, CRM, Inventory, Customer Portal, Invoicing, Membership)
         with visual cards showing what each includes
Step 3: Feature selection (checkboxes based on category chosen in Step 2)
Step 4: Branding (primary color picker, logo upload, font preference)
Step 5: Review & Generate button

Save intake data to Supabase apps table on submission and redirect to /generate.
Show a progress bar across all steps.
```

### PROMPT 4 — Claude API Generation Engine
```
Build the app generation engine for Vision Workx.

In /api/generate, take the intake form data from Supabase and construct
a structured prompt for Claude API (claude-sonnet-4-6) that generates
a complete, deployable Next.js + Supabase app.

Use this system prompt structure:
"You are an expert Next.js and Supabase developer. Generate a complete,
production-ready web application based on the following business requirements.
Output only clean, commented code files in this format:
[FILENAME: path/to/file.tsx]
<code>
[/FILENAME]
Generate all files needed for a working app including: pages, components,
API routes, Supabase schema, and a README."

Stream the response to the /generate page using the Vercel AI SDK.
Save the completed generated code to the apps table in Supabase.
Update app status from 'generating' to 'ready' on completion.
```

### PROMPT 5 — Stripe Billing
```
Implement Stripe billing for Vision Workx with three subscription tiers:
- Starter: $49/mo (price ID from env)
- Growth: $99/mo (price ID from env)
- Pro: $199/mo (price ID from env)

Build:
1. /billing page showing current plan and usage
2. Upgrade/downgrade flow using Stripe Customer Portal
3. /api/webhooks/stripe handler for: checkout.session.completed,
   customer.subscription.updated, customer.subscription.deleted
4. Middleware that checks subscription status and gates /onboard and /generate
   behind an active subscription (free trial: 14 days)
5. Update the subscriptions table in Supabase on every webhook event
```

### PROMPT 6 — Dashboard
```
Build the /dashboard page for Vision Workx.

Show:
- Welcome header with user's name and current plan badge
- "Create New App" button (links to /onboard, gated by plan app limit)
- Grid of app cards — each showing: app name, category icon, status badge
  (Generating / Ready / Failed), created date, and a View / Edit button
- Empty state with illustration and CTA when user has no apps yet
- Usage bar showing apps used vs plan limit (1 for Starter, 3 for Growth, ∞ for Pro)

Fetch apps from Supabase filtered by the authenticated user's ID.
Poll every 5 seconds for apps with status 'generating' to show live updates.
```

### PROMPT 7 — Landing Page
```
Build a high-converting marketing landing page for Vision Workx at /.

Sections:
1. Hero — headline: "Describe it. We build it.", subheadline about AI-powered
   apps for small businesses, email capture CTA, and a browser mockup showing
   the intake form
2. How It Works — 3 steps with icons: Describe → Generate → Launch
3. App Categories — 6 cards (Booking, CRM, Inventory, Portal, Invoicing, Membership) with descriptions
4. Pricing — 3 tier cards (Starter $49, Growth $99, Pro $199) with feature lists
   and a "Start free trial" CTA on each
5. Social proof — 3 placeholder testimonial cards
6. Footer — Vision Workx, A Revalor Company, links

Use a clean, professional blue and white color scheme matching the brand.
Make it fully responsive for mobile.
```

### PROMPT 8 — Deployment Automation
```
Build the auto-deployment pipeline for Vision Workx.

When a user's app generation is complete (status = 'ready'):
1. Parse the generated code files from the Supabase apps table
2. Use the Vercel API to create a new project for the customer's app
3. Push the generated files to the new Vercel project via the Vercel API
4. Trigger a deployment and poll for completion
5. Save the live deploy_url back to the apps table
6. Send the customer an email via Resend with their app URL

Create this as a Supabase Edge Function at supabase/functions/deploy-app/
that triggers when the apps table status column changes to 'ready'.
```

---

## Design Guidelines

- **Primary color:** #1A3A5C (dark navy)
- **Accent:** #2E6DA4 (mid blue)
- **Background:** #F8FAFC (off white)
- **Font:** Inter (Google Fonts)
- **Tone:** Professional but approachable — small business owners, not developers
- **Always mobile responsive**
- **Loading states on every async action**

---

## Key Rules for Claude Code

- Never put API keys in the frontend — all Anthropic and Stripe calls go through API routes
- Every page that accesses user data must check Supabase auth session server-side
- Use TypeScript throughout — no plain JS files
- Add error boundaries and loading skeletons to all data-fetching components
- Generated apps must be simple enough for a non-technical user to manage
- Keep the UI clean — small business owners are not developers

---

## Company Context

**Product:** Vision Workx
**Parent company:** Revalor
**Market:** United States — small businesses with 1–20 employees
**Business model:** SaaS subscriptions + agency done-for-you builds
**6-month MRR target:** $5,000+
**Parallel agency rate:** $2,500–$15,000 per custom build

---

*Vision Workx · A Revalor Company · Confidential*
