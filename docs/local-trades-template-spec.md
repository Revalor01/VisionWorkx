# Local Trades Website Template — Build Spec

_As of 2026-10-05._

> Phase 1 of the polished-templates roadmap: one opinionated template for home-
> and field-service trades, where AI fills the content and the template carries
> the look.

> Companion: [Polished Website Templates — Revalor Strategy](./website-templates-strategy.md) (the why + roadmap).

## Overview

This template serves home- and field-service trades — plumbers, electricians,
HVAC, landscapers, roofers, contractors, handymen, cleaners. Their customer
arrives with a problem and a short, trust-driven decision: is this a real, local,
trustworthy pro, and how do I reach them?

So the whole page optimizes for **one conversion — a phone call or a quote
request** — and for credibility: licensed, insured, local, well-reviewed, real
work shown.

The template is the fixed part — layout, design system, section order. **AI fills
only the content** (copy, which optional sections apply, the service list) from
the Needs Analyzer intake: trade, services, service area, tone, differentiators.
It never designs the page.

## Page layout

Twelve sections, top to bottom. The three **conversion** sections (Hero, Get a
quote, Final CTA) carry a module and must stay above the fold or at the very end;
the rest build trust in between.

1. Header / sticky nav — _tap-to-call_
2. **Hero** — _quote / lead CTA_
3. Services
4. Service area
5. Why us / trust
6. Reviews
7. Project gallery _(optional)_
8. How it works — _booking (optional)_
9. **Get a quote** — _quote calculator / lead_
10. Offer / financing _(optional)_
11. **Final CTA + contact** — _lead / booking_
12. Footer

## Sections & content slots

The **AI-filled** column is what the model writes from the intake; everything
else is fixed by the template.

| # | Section | Goal | AI-filled content | Module slot |
| --- | --- | --- | --- | --- |
| 1 | Header / sticky nav | Orient + keep the phone in reach | Name/logo, nav links, phone | tap-to-call |
| 2 | Hero | Stop + convert | Headline (trade + area), trust subhead, primary CTA | Quote / lead CTA |
| 3 | Services | Show the jobs done | 4–8 service cards (name + one line) | — |
| 4 | Service area | "They come to me" | Towns / ZIPs served, map | — |
| 5 | Why us / trust | Credibility | Badges (licensed, insured, years), 2–3 differentiators, guarantee | — |
| 6 | Reviews | Social proof | Star rating + 3–6 testimonials | — |
| 7 | Project gallery | Proof of real work | Before/after or project photos + captions | — |
| 8 | How it works | Reduce friction | 3 steps (Call → Quote → Done) | Booking (optional) |
| 9 | Get a quote | Primary conversion | Section copy + fields | Quote calculator **or** lead capture |
| 10 | Offer / financing (optional) | Nudge | Coupon or "financing available" | — |
| 11 | Final CTA + contact | Catch the scrollers | Phone, hours, emergency line, address | Lead capture / booking |
| 12 | Footer | Close + SEO | Hours, area, license #, socials, legal | — |

Sections 7, 8 and 10 are **optional** — the AI includes them only when the intake
supports them (photos on hand, after-hours service, financing offered).

## VisionWorkx module slots

The template ships with working functionality, not a brochure. Three slots, each
rendered only when the owner has that module:

- **Quote calculator** (hero CTA + the "Get a quote" section) — for trades with priceable jobs. The customer gets an instant estimate; the lead lands in the owner's workspace.
- **Lead capture** (the quote section when pricing isn't instant, plus the final CTA) — name, phone, job description, optional photo upload. The fallback conversion when a quote can't be auto-priced.
- **Booking** ("How it works" step 1 and the final CTA, when the trade takes appointments) — schedules an on-site visit and syncs to the owner's Google Calendar once connected.

Each slot is a named region; one embed snippet per module, so the page and the
modules are one product rather than a site plus bolt-ons.

## Starter design tokens

A trades starting point — sturdy, high-contrast, trustworthy, with one strong CTA
color. Refine in ui-theme-designer; keep contrast AA+.

| Token | Value | Rationale |
| --- | --- | --- |
| color.ink | #0F172A | Near-black text, high contrast |
| color.bg / surface | #FFFFFF / #F4F6F8 | Clean, fast; surface for section banding |
| color.brand | #13395E | Deep navy — reads licensed / established |
| color.accent (CTA) | #F97316 | Safety orange — urgency; the only loud color |
| color.trust | #15803D | Green for guarantees / "available now" |
| font.display | Barlow / Archivo (bold) | Industrial, confident headlines |
| font.body | Inter | Neutral, legible on phones |
| type.scale | 1.25 (major third) | Clear hierarchy without shouting |
| radius | 8px cards, full buttons | Friendly, not soft |
| space.unit | 8px grid | Consistent rhythm |
| elevation | one subtle shadow level | Flat and fast, not slideware |
| cta.target | 48px+ | Thumb-friendly, mobile-first |

The accent is reserved for call/quote actions only, so the eye always finds the
conversion. The client's brand color maps onto `brand`/`accent` while contrast
stays AA.

## Imagery & copy direction

Imagery is the top polish lever for trades — real-looking work beats stock
clichés.

- **Hero** — a real technician / van / job on-site, not a smiling stock model. Curated stock keyed to the trade (Unsplash / Pexels) by default; swap in the client's own photos when supplied.
- **Services** — simple line icons per service, not photos (keeps the grid clean and fast).
- **Gallery** — the client's own before/after shots when available; skip the section rather than fake it with stock.
- **Logo & brand** — the client's logo and one brand color are first-class inputs; the accent token adapts to the brand while staying AA.
- **Copy tone** — plain, direct, local, benefit-first ("Same-day drain cleaning in <city> — upfront pricing"). No corporate filler. AI writes from the intake; headlines name the trade + area for SEO.
- **Art-directed AI images** only where stock is weak, with tight prompts (trade, setting, realism) — never generic "business" imagery.

## Theme variants & acceptance

**Variants** — same layout, different skins, chosen from the intake's tone:

1. **Established & trustworthy** — deep navy + white, badges prominent. Default for plumbing / electrical / HVAC.
2. **Bold & industrial** — charcoal + safety-orange, heavy display type, big photos. For contractors / roofers.
3. **Fresh & local** — green + warm neutrals, rounded, friendly. For landscaping / cleaning / home services.

**Acceptance — the template ships only when it:**

- [ ] Is mobile-first and clears the website check's bar (mobile, speed, SEO basics)
- [ ] Shows a tap-to-call in the header and hero on phones
- [ ] Surfaces one clear conversion (call or quote) above the fold and at the end
- [ ] Renders correctly with real intake content for 3 different trades
- [ ] Drops in at least one working module (quote or lead) end to end
- [ ] Reads as hand-designed, not templated, to a demanding reviewer

---

_Originally drafted as a Claude doc (with a page-layout wireframe and a roadmap
diagram); committed here as Markdown for the repo record._
