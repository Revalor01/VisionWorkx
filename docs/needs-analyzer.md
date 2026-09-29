# Revalor Needs Analyzer (online)

The online copy of the offline sales tool (`revalor-needs-analyzer`, the laptop
app Machine B owns). Work through a questionnaire with a business owner; it
recommends a phased build plan from the catalog, prices it, produces a proposal
and flags internal notes and ecosystem gaps. Both apps stay in use: offline at a
meeting with no internet, online everywhere else, with a sync from the laptop.

## Where things are

| What | Where |
| --- | --- |
| Screens (operator only) | `/admin/needs-analyzer` (list), `/<id>?tab=q\|plan\|proposal\|internal`, `/ecosystem`, `/catalog` |
| Client proposal link | `/proposal/<token>` (public, only while the link is on) |
| Questionnaire, scoring, pricing | `lib/needsAnalyzer/questions.ts`, `rules.ts` (ported from the offline `public/questions.js`, `public/rules.js`) |
| Default catalog / ecosystem | `lib/needsAnalyzer/*.default.json` (copies of the offline defaults) |
| Tables (main project) | `vw_na_assessments`, `vw_na_settings` — migrations `20240101000093`, `20240101000094` |
| API | `/api/admin/needs-analyzer/*` (operator), `/api/needs-analyzer/sync` (sync secret) |
| Laptop sync script | `scripts/needs-analyzer-sync.mjs` |

Both tables have RLS on and no policies: only server code with the service role
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
admin screens/API need the operator, the sync route needs the secret, and unknown
proposal links 404. A full create → share → open → revoke test needs the runner
to get a main-project key or an operator session (a secrets change; ask first).
