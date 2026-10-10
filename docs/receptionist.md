# AI receptionist (modules)

A module type (`receptionist`) that puts a chat assistant on a client's website.
It answers questions from facts the owner wrote, books appointments through the
owner's booking module, and takes messages. Data lives in the **modules**
Supabase project, like every other module.

## Where things are

| What | Where |
| --- | --- |
| Config (facts, lead fields) | `lib/receptionist/config.ts` |
| System prompt and guardrails | `lib/receptionist/prompt.ts` |
| Tools (availability, booking, message) | `lib/receptionist/tools.ts` |
| One chat turn (Claude loop) | `lib/receptionist/chat.ts` |
| Saving a lead as a submission | `lib/receptionist/lead.ts` |
| Server wiring, usage counter | `lib/receptionist/server.ts`, `owner.ts` |
| Plain English to draft | `lib/receptionist/draft.ts` (via `POST /api/workspace/[slug]/modules/draft`, `kind: "receptionist"`) |
| Public chat API | `POST /api/m/[moduleId]/chat` |
| Owner "Test it" | `POST /api/workspace/[slug]/receptionist/test` |
| Transcript for a lead | `GET /api/workspace/[slug]/receptionist/transcript?submission=<id>` |
| UI | `components/modules/ReceptionistEditor.tsx` (owner), `ChatWidget.tsx` (visitor) |
| Embed | `public/embed.js`, `data-widget="chat"` |
| Phone: provider interface, Retell agent and numbers | `lib/receptionist/voice/provider.ts`, `retell.ts` |
| Phone: number lookup, minutes cap, agent sync, usage | `lib/receptionist/voice/server.ts` |
| Phone: transcript and outcome from Retell payloads | `lib/receptionist/voice/calls.ts` |
| Phone: Retell webhooks | `POST /api/receptionist/voice/inbound`, `/tools`, `/webhook` |
| Phone: get or release a number | `POST` / `DELETE /api/workspace/[slug]/receptionist/number` |
| Phone: owner panel data | `voicePanelFor()` in `lib/receptionist/owner.ts`, `PhoneSection` in `ReceptionistEditor.tsx` |
| Migrations (modules project) | `supabase-modules/migrations/20261010000011_vw_receptionist.sql`, `20261010000012_vw_receptionist_calls_grants.sql` |

## Owner setup

1. **Describe**: at `/workspace/<slug>/modules/new?type=receptionist` the owner
   describes the business (up to 2,000 characters). Claude Haiku 4.5 drafts the
   chat title and intro, greeting, about, services and prices, hours, location,
   FAQ, tone (friendly / professional / casual) and the follow-up promise. It uses
   only what the owner wrote and leaves the rest blank. Drafts share the forms'
   limits: the plan's monthly AI drafts and 20 per hour per workspace.
2. **Edit facts**: the owner checks every field, and can link a booking module
   from the same workspace ("Book appointments with"). The "about" field needs at
   least a sentence or two before it can be saved.
3. **Test it**: the owner chats with the *unsaved* setup. Nothing is stored:
   bookings and messages are simulated, and availability is real but read-only.
   Limited to 60 test turns per hour per workspace.
4. **Save & publish**: the module goes live. The chat only loads on the
   workspace's own domains, so a website must be added in Settings first.
5. **Snippet**: copy it from the Modules & install page. It's the usual
   `<script data-module=...>` tag with `data-widget="chat"`. Pasted once, site-wide,
   it adds a chat button at the bottom right (full screen on phones).

## How the AI is constrained

The guardrails are fixed text the owner can't edit (`prompt.ts`):

- It answers only from the owner's facts. If something isn't there it says so and
  offers to take a message. It never invents prices, availability, policies or services.
- If asked, it says plainly that it's an AI assistant. The widget footer says
  "AI assistant · Powered by VisionWorkx".
- No medical, legal, financial or safety advice. For emergencies it tells people to call 911.
- It never asks for payment details, passwords, social security numbers or health details.
- It books only when the linked module is a **live booking module in the same
  workspace** with at least one service (`linkedBooking()`). Otherwise it can only
  take messages. Bookings use the booking module's real slot logic, so the
  database still rejects double-booking.

## Where leads and bookings land

Each message or booking is saved as an **ordinary submission** (`lead.ts`):

- Messages belong to the receptionist module. Bookings belong to the linked
  booking module and also appear in its bookings list, with reminders and
  calendar sync like a normal booking.
- A `submission.created` event goes out, so **revalor-automation** emails the
  owner an alert (plus the customer confirmation). The workspace webhook fires too.
- On the **Submissions** board, a lead marked "Website chat (AI receptionist)"
  shows the chat transcript.

## Data model (modules project)

| Table | Holds |
| --- | --- |
| `vw_receptionist_conversations` | One row per chat or phone call: channel, message count, linked submission, visitor token hash, tokens and cost |
| `vw_receptionist_messages` | The transcript (visitor / assistant, max 4,000 characters each) |
| `vw_receptionist_numbers` | Phone numbers, at most one active per workspace (Retell agent id hidden from owners) |
| `vw_receptionist_calls` | Phone calls: duration, outcome, summary, caller number; cost hidden from owners |
| `vw_receptionist_usage` | Monthly counters per workspace: chats, voice seconds |

`vw_receptionist_add_usage()` adds to the monthly counter in one atomic step.
Only the service role can run it.

Who can see what:

- Business logins (owners and staff) can **read** their own workspace's rows in
  these tables, and never another workspace's.
- Nobody signed in can write to them. Every write goes through the VisionWorkx
  server with the service role.
- Even owners can't see the visitor token hash or the token and cost columns on
  conversations, the cost column on calls (`20261010000012`), or the voice
  provider's agent id on numbers.
- Website visitors never touch the database directly. A chat is continued only
  with its id plus a random token held by the visitor's browser (only its
  sha256 is stored), so nobody can read or continue someone else's chat.

The migration also widens two checks in place: `vw_modules.type` now allows
`receptionist`, and `vw_usage_alerts.kind` allows `chats_80`, `chats_100`,
`chats_150`, `voice_80`, `voice_100`. It's already applied to the modules project.

## Limits and abuse caps

Chats per month by plan (`lib/modules/plans.ts`): **Starter 300 / Growth 1,500 /
Pro 5,000**. This is a soft limit, like submissions: the owner is emailed at 80%
and 100%, and new chats pause at 150%. A new chat counts only after it gets a real reply.

Enforced on the server, so steering the model can't get around them:

- At most 1 booking and 1 message saved per conversation.
- 5 new chats per visitor IP per hour per module.
- 20 visitor turns and $0.15 of Claude spend per conversation. After that the
  visitor is asked to contact the business directly.
- 1,000 turns per workspace per day.
- 30 messages per IP per 10 minutes and 600 per module per hour.
- Messages up to 1,000 characters. Request bodies up to 8 KB.
- Leads count toward the plan's submissions and respect the same soft limit.
- The chat only answers on the workspace's own domains, and only while the module
  is live and billing allows service. A filled honeypot gets the greeting back
  without calling Claude.

## Cost

Claude Haiku 4.5 (`claude-haiku-4-5`), replies capped at 400 tokens, business
facts cached as the system prompt. Estimated (from Haiku list prices, not yet
measured) at about 1–4 cents a conversation; $0.15 is the hard cap per conversation. Usage is logged to `ai_usage_log` as `receptionist_chat`
(live chats) and `receptionist_setup` (drafts and Test it).

## Env vars

None new for chat. It uses the existing `ANTHROPIC_API_KEY` and the modules
Supabase variables.

## How to test

- Unit tests: `lib/receptionist/receptionist.test.ts` (`npm test`).
- QA: `visionworkx/receptionist/chat-widget` (smoke: open the chat on a host page,
  get a reply, conversation and usage recorded) and
  `visionworkx/receptionist/chat-guards` (another origin is refused, a wrong token
  can't continue a chat, a draft receptionist doesn't answer).
- `scripts/modules-isolation-test.mjs` covers the receptionist tables: own
  workspace only, hidden columns, no client writes, usage function server-only.

## Rollback

Revert the PR. The migration is additive apart from the two widened checks, so the
tables can stay in place.

## Phone (voice)

The same receptionist can also answer phone calls. It runs on **Retell**
(`retell-sdk`), behind a small provider interface (`voice/provider.ts`), so
another voice platform could be swapped in without touching the routes.

### How it works

- Each workspace gets **one Retell agent and one US number** (at most one active
  number per workspace, also enforced by a unique index). The agent uses the same
  system prompt and tools as chat, in voice mode, on Retell's `claude-4.5-haiku`.
  The current local time and the minutes-cap note are passed in per call, so the
  stored prompt never goes stale.
- Every call opens with: "Hi, you've reached <business>'s AI assistant. This call
  may be transcribed." followed by the owner's greeting.
- Tools are the chat tools (availability, booking, message), plus hang-up, plus
  transfer to the owner when a transfer number is set. Tool calls are never
  retried, so a lead or booking can't be saved twice. The workspace always comes
  from the **dialled number**, never from the model.
- We store the transcript (a `voice` conversation in
  `vw_receptionist_conversations`, messages in `vw_receptionist_messages`) and
  call details (duration, cost, outcome, Retell's summary) in
  `vw_receptionist_calls`. We don't store the audio recording. Retell keeps its
  own copy of call data for 30 days.
- Calls hang up after 30 seconds of silence and are inbound from the US and
  Canada only.
- When the owner saves the receptionist, the new facts are pushed to the
  existing agent in the background (`syncVoiceAgent`, from
  `PATCH /api/workspace/[slug]/modules/[publicId]`).

### Owner flow

The **Phone** panel on the receptionist's setup page (`PhoneSection` in
`ReceptionistEditor.tsx`) appears only when voice is switched on and the
receptionist has been saved.

1. **Get a phone number**, with an optional area code. Needs an active plan
   (not past due) and is limited to 3 numbers per workspace per day. If no number
   is available in that area code the owner is asked to try another or leave it blank.
2. **Call forwarding**: to keep an existing line, the owner sets their carrier's
   "forward when busy/unanswered" to the new number (instructions shown in the
   panel), or puts the new number on their website.
3. **Transfer callers to** (optional): the owner's cell, used for urgent calls or
   when the caller asks for a person. Takes effect after Save.
4. **Release this number**: deletes the number and its agent at Retell. The exact
   number can't be got back.

The panel also shows minutes used this month against the plan.

### Webhooks

All three are signed by Retell with the API key (`x-retell-signature`, checked
against the exact raw body). Anything unsigned gets a 401.

| Route | What it does |
| --- | --- |
| `POST /api/receptionist/voice/inbound` | Before each call rings through: answers only for a live module in a paying workspace, applies the call rate limits and the minutes cap, and passes the per-call time and cap note. |
| `POST /api/receptionist/voice/tools` | Mid-call tool use (availability, booking, message). Same tool code as chat. Links any saved lead to the call's conversation. |
| `POST /api/receptionist/voice/webhook` | `call_ended`: stores duration, cost, outcome and transcript and adds the minutes to the month. `call_analyzed`: stores Retell's summary and, if the caller spoke but nothing was saved during the call, saves the summary as a "Phone caller" lead. |

### Minutes cap and call limits

Voice minutes per month by plan (`voiceMinutesPerMonth` in `lib/modules/plans.ts`):
**Starter 100 / Growth 300 / Pro 1,000**. Every minute costs real money, so:

- Under the plan's minutes: calls are answered normally.
- At 100%: calls are limited to taking a short message and are cut off after
  2 minutes.
- Past 120%: calls are refused.
- 60 calls per number per hour and 6 calls per caller per hour. Over either,
  calls are refused (fails closed).
- Every call is capped at 10 minutes.
- The owner is emailed at 80% and 100% of the minutes.

Usage is counted **once per call**: only the first `call_ended` delivery records
minutes and the transcript, so a retried webhook can't count twice. Phone leads
are ordinary submissions, like chat leads.

When a Modules workspace is deleted by the retention cron
(`/api/cron/modules-retention`), its number is released at Retell first so it
stops costing money. If `RETELL_API_KEY` isn't set the cron fails for that
workspace instead of deleting it.

### Env vars (voice)

- `RETELL_API_KEY` (required): Retell API key. Also used to check webhook signatures.
- `RECEPTIONIST_VOICE_ENABLED=true` turns voice on. Off by default: the Phone
  panel is hidden, numbers can't be bought and calls are refused.
- `RETELL_VOICE_ID` (optional): Retell voice for new agents, default `retell-Cimo`.

Use a dedicated Retell account for VisionWorkx.

### How to test (voice)

- Unit tests: `lib/receptionist/voice/voice.test.ts` (`npm test`): agent config,
  signatures, call payloads, minutes cap.
- Real calls: on a preview deployment with the env vars set, use a comped test
  workspace, get a number, call it, and check the transcript, lead and minutes.
  Release the number afterwards.

### Rollback (voice)

Unset `RECEPTIONIST_VOICE_ENABLED` (calls are refused and the panel disappears),
release any numbers so they stop costing money, then revert the PR.
