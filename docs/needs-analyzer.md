# Revalor Needs Analyzer (online)

The online copy of the offline sales tool (`revalor-needs-analyzer`, the laptop
app Machine B owns). Work through a questionnaire with a business owner; it
recommends a phased build plan from the catalog, prices it, produces a proposal
and flags internal notes and ecosystem gaps. Both apps stay in use: offline at a
meeting with no internet, online everywhere else, with a sync from the laptop.

## Where things are

| What | Where |
| --- | --- |
| Screens (operator only) | `/admin/needs-analyzer` (list), `/<id>?tab=q\|plan\|proposal\|builder\|internal`, `/website`, `/ecosystem`, `/catalog` |
| Client proposal link | `/proposal/<token>` (public, only while the link is on) |
| Questionnaire, scoring, pricing | `lib/needsAnalyzer/questions.ts`, `rules.ts` (ported from the offline `public/questions.js`, `public/rules.js`) |
| Website check | `lib/needsAnalyzer/siteFetch.ts` (fetcher), `siteDetect.ts` (detection, prefill), `siteCheck.ts`, `pagespeed.ts`, `siteReview.ts` (AI review) |
| Default catalog / ecosystem | `lib/needsAnalyzer/*.default.json` (copies of the offline defaults) |
| Tables (main project) | `vw_na_assessments`, `vw_na_settings`, `vw_na_site_checks` — migrations `20240101000093`, `20240101000094`, `20240101000095` |
| API | `/api/admin/needs-analyzer/*` (operator, including `site-check`), `/api/needs-analyzer/sync` (sync secret) |
| Laptop sync script | `scripts/needs-analyzer-sync.mjs` |

All three tables have RLS on and no policies: only server code with the service role
can touch them, after checking the operator, the sync secret, or a share token.

## Keep the two apps in step

Assessments sync unchanged, so field ids in `questions.ts` and the scoring in
`rules.ts` must match the offline app. `rules.test.ts` pins the sample
assessment's plan to what the offline `rules.js` produces; if you change the
rules in one app, change them in the other and regenerate the expected values.

## Client link

Proposal tab → **Client link**: *Turn on link*, *Copy link*, *New link* (the old
one stops working) and *Turn off*. Deleting an assessment turns its link off.
The page shows only the proposal (`app/admin/needs-analyzer/Proposal.tsx`) —
never fit scores, flags, effort, margin or consultant notes. It's `noindex`.

## Client mode

The toggle (top right) hides Internal notes, the Consultant notes section,
Ecosystem, Catalog & pricing and the admin header while the client is looking.
It's remembered per browser.

## Website check

**Website check** in the Needs Analyzer nav (`/admin/needs-analyzer/website`,
hidden in Client mode). Enter a business's address and it reads the home page
plus up to 5 same-site pages whose links look useful (contact, booking, pricing,
services, about), then reports:

- the platform / what built the site — WordPress, Squarespace, Wix, Webflow,
  Shopify, GoDaddy, Framer, Weebly, Duda, HubSpot, Ghost, Joomla, Drupal, Carrd,
  Google Sites, Gatsby, Next.js, Hugo, Jekyll — and, when none of those is
  fingerprinted, whatever the page's own `<meta name="generator">` declares
  (otherwise "unknown / custom") — plus the third-party tools it spotted;
- what the site can do: contact form, online booking, pricing or instant quote,
  reviews, live chat, email signup, analytics, tap-to-call, social links;
- problems, ranked high / medium / low (no HTTPS, not set up for phones, no
  enquiry form, slow, "Book" buttons with no booking tool, weak title, etc.);
- which catalog modules the site points to.

Each check is saved; the screen lists recent ones. From an assessment, the
Business section of the questionnaire and Internal notes show the latest check
with *Check website* / *Check again* / *View check*.

**Prefill.** *Start assessment from this* creates an assessment with answers
taken from the site (website, platform, lead sources, appointments/booking
method, quotes, email list, current tools, Website observations). *Apply to
assessment* fills only answers that are still empty (`applyPrefill` in
`siteDetect.ts`), so nothing the operator entered is overwritten. The check only
fills questionnaire answers; `rules.ts` and the scoring are untouched, so the
plan still comes from the answers exactly as in the offline app.

**Proposal.** Tick problems in a check to put them on the proposal. The Proposal
tab and the client link show "What we found on <site>" with only the ticked
problems (title and plain-English explanation), from the newest linked check
that has any ticked. Untick them all and the section disappears. Page text,
scores and the AI review never reach the client.

**PageSpeed (optional).** With `GOOGLE_PAGESPEED_API_KEY` set (free key, Google
Cloud → PageSpeed Insights API), each check also gets Google's mobile scores,
which can add slow-on-phones, search-basics and accessibility problems. Google
fetches the site from its own servers. Without the key it's skipped.

**AI review (optional).** *Run AI review* on a check asks Claude Haiku 4.5 for a
business summary, services, message clarity, calls to action, weak spots and
talking points. It uses the page text saved with the check (no new fetch), runs
only when clicked, costs about 1 cent and is logged to `ai_usage_log` as
`needs_analyzer_site_review`. The page text is treated as untrusted data and the
result is shown to the operator only.

**Safety (SSRF).** The operator types the address, so `lib/needsAnalyzer/siteFetch.ts`
only fetches `http`/`https` on ports 80/443, refuses usernames/passwords and
`localhost`/`.local`/`.internal`-style names, and follows redirects by hand
(at most 5) so every hop's hostname is checked to resolve only to public
addresses: private, loopback, link-local (including `169.254.169.254`), CGNAT,
reserved and non-global IPv6 are refused. Pages are capped at 2 MB and 8 seconds;
DNS lookups at 3 seconds. Known residual risk: DNS could change between the check
and the fetch's own lookup (DNS rebinding). Accepted for an operator-only tool;
revisit before opening this to customers.

**Known limits.** Detection is pattern matching on the page HTML: consistent
and free, but anything a site builds only in the browser after load can be
missed, and wording can mislead it (e.g. "book" text without a tool, or a
testimonial quote that mentions pricing). Treat the report as a starting point
for the conversation, not a verdict.

**Table.** `vw_na_site_checks` (main project, migration `20240101000095`): the
address entered and the final one, the linked assessment, the report, PageSpeed
scores, the AI review, and `proposal_issues` (ids ticked for the proposal).
RLS on, no policies, like the other `vw_na_*` tables.

## Website builder

**Website builder** tab (operator only, hidden in Client mode like Internal notes)
is the runbook for actually building the client's website. It captures, per
assessment:

- **Build path** — a standard builder in the client's own account (Squarespace,
  Wix, WordPress, Webflow) or a custom Next.js/Vercel site Revalor builds and
  hosts. The custom path takes a **monthly retainer** and carries the Vercel
  "Hobby is non-commercial only" caveat.
- **Domain & DNS** — domain, registrar, client ownership, access method, and a
  reminder not to touch the **MX records** when the client already runs email on
  the domain.
- **Pieces every site needs** and a **handoff checklist**.
- **Effort & timeline** — `buildDays` is operator-only effort; `timelineNotes` is
  the only build-timing text the client ever sees.

State lives in `overrides.websiteBuild` (see `lib/needsAnalyzer/types.ts`), an
**online-only** JSON field — no new table or migration. It never affects module
scoring, so `rules.ts`/`rules.test.ts` and the offline app are untouched; the
laptop app carries the field through sync unchanged. The presets, copy and the
client-safe proposal summary are in `lib/needsAnalyzer/websiteBuild.ts`
(`websiteBuildSummary`, guarded by `websiteBuild.test.ts`).

With **Show in client proposal** ticked, a client-safe **"Your website"** section
is added to `Proposal.tsx` (both the admin Proposal tab and the public
`/proposal/<token>` link) — the operator's chosen path, domain ownership, what
Revalor maintains and the monthly retainer, and handoff. It never shows effort or
margin. An optional `clientSummary` overrides the auto-generated wording.

## Syncing from the laptop

One-time:
1. Set `NEEDS_ANALYZER_SYNC_SECRET` in Vercel (production) to a long random value.
2. On the laptop, save the same value as the first line of `~/.needs-analyzer-sync-secret`
   (not inside the analyzer folder, so it never gets zipped up with it), or set it as the
   `NEEDS_ANALYZER_SYNC_SECRET` environment variable there.
3. Copy `scripts/needs-analyzer-sync.mjs` somewhere on the laptop (Node 18+, no packages).

Each time the laptop is back online:

```
node needs-analyzer-sync.mjs ~/Documents/revalor-needs-analyzer            # assessments
node needs-analyzer-sync.mjs ~/Documents/revalor-needs-analyzer --settings # + catalog & ecosystem
node needs-analyzer-sync.mjs ~/Documents/revalor-needs-analyzer --dry-run  # show, send nothing
```

It sends to `https://vision-workx.vercel.app` unless you pass `--url <site>`. The
secret goes to that address, so `--url` must be `https://` (or `http://localhost` /
`127.0.0.1` for a local dev server); anything else stops before sending.

Matching is by the offline id (`local_id`). `synced_at` records the laptop's
`updatedAt` the last sync wrote; online edits bump `updated_at`. So:

| Laptop changed | Online changed | Result |
| --- | --- | --- |
| new | — | added |
| yes | no | updated |
| no | yes | kept online, listed as "changed online" |
| yes | yes | kept online, listed as a conflict (re-enter the laptop changes online) |
| — | deleted online | stays deleted |

Sync is one-way (laptop → online). Nothing on the laptop is changed, and
assessments started online don't go back to the laptop. `--settings` replaces
the online catalog and ecosystem with the laptop's.

Size limits: a sync is at most 500 assessments and 8 MB; operator saves are at
most 512 KB. Oversized bodies are refused on their declared `content-length`
before being read, then checked again on the real size.

## Logos

Catalog & pricing → Brand logos holds an https image address per slot,
defaulting to the files on products.revalorllc.com; clear a slot to hide that logo.
Any text saves, but only plain `https://` addresses are ever shown, and logo images
load with `referrerPolicy="no-referrer"` (so the image host never sees admin or
proposal URLs, including share tokens). File upload isn't built yet.

## QA

`qa/products/visionworkx/needs-analyzer.qa.ts` checks from outside that the
admin screens/API (including the website check screen and its `site-check`
APIs) need the operator, the sync route needs the secret, and unknown
proposal links 404. Unit tests: `lib/needsAnalyzer/siteDetect.test.ts`
(detection and prefill against sample pages) and `siteFetch.test.ts` (address
checks and blocked ranges).

Manual checks in `qa/products/visionworkx/manual.json` (area "Needs Analyzer"):
the assessment → plan → proposal → client link flow; a website check of a real
site (and that `localhost` / `169.254.169.254` are refused) starting an
assessment; ticked problems appearing on the proposal and client link; and the
AI review. A full create → share → open → revoke test needs the runner
to get a main-project key or an operator session (a secrets change; ask first).
