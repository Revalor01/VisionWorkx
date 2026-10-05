# Polished Website Templates — Revalor Strategy

_As of 2026-10-05._

> Next product tier beyond embeddable modules: Revalor-built websites that look
> designed, not generated — for the local-service small businesses Revalor serves.

> Companion: [Local Trades Website Template — Build Spec](./local-trades-template-spec.md) (Phase 1 detail).

## The core bet

Polished output comes from an opinionated design system plus AI-filled content —
not from generating layouts. The frozen full-app builder proved the opposite:
free-form generation yields competent-but-generic sites, because nothing
underneath holds a design opinion.

**Thesis: constrain AI to content and section choice; invest the design craft
once, in templates; let templates — not prompts — carry the look.**

That makes this a design-and-content investment, not an engineering one. The
plumbing already exists — the module embed, Vercel deploys, and the Needs
Analyzer intake that captures each business.

## Market coverage: four archetypes, not thirty templates

Revalor's target verticals collapse into four site shapes. Cover these four well
— each with two or three theme variants — and roughly 8–12 templates serve the
market.

| Archetype | Verticals | Core sections |
| --- | --- | --- |
| Local trades / service | Plumber, electrician, landscaper, contractor | Quote / "call now" hero, services grid, service area, reviews, quote or booking CTA |
| Appointment services | Salon, spa, clinic, studio, gym, wellness | "Book now" hero, services + pricing, team, gallery, booking |
| Professional services | Law, accounting, consultants, agencies | Authority hero, services, case studies / testimonials, contact or portal |
| Retail / hospitality | Cafe, boutique, maker, retailer | Visual hero, menu or products, hours + map, order or shop |

Theming (color, type, imagery style) is what keeps templates in one archetype
from looking alike.

## Anatomy of a polished template

A template is eight parts; only the first is scarce.

1. **Design system** — type scale, spacing, color themes, motion. The gating asset.
2. **Section library** — hero, services, pricing, team, gallery, testimonials, FAQ, contact, map, footer — built once, composed per archetype.
3. **Theming tokens** — color, type, radius and imagery style per brand, so one template yields many looks.
4. **AI content** — copy and section selection from the Needs Analyzer intake. Content, never layout.
5. **Imagery pipeline** — curated stock by vertical or art-directed AI images, plus proper logo handling.
6. **Module slots** — first-class places for booking / lead / quote / intake modules, so site and modules are one product.
7. **Delivery + edit model** — deploy to Vercel (subdomain → custom domain); how the owner edits later.
8. **Acceptance QA** — the website check's own bar (mobile, speed, SEO) plus a canary-style reliability gate.

## The decision that drives everything: substrate + editability

The substrate fixes both the polish ceiling and how owners edit, so decide it
first. Lean: **Next.js + a premium component kit for v1**, with **Framer** as the
fast path if owner self-editing becomes the priority.

| Dimension | Next.js + Tailwind/shadcn + kit | Framer | Webflow |
| --- | --- | --- | --- |
| Polish ceiling | High (with a bought kit) | Very high | High |
| Dev control + module embed | Full — our stack, native | Moderate — embed component | Moderate — custom code |
| Owner self-editing | Weak (needs CMS work) | Strong (built in) | Strong (built in) |
| Per-site cost | Hosting only (Vercel) | Per-site Framer plan | Per-site Webflow plan |
| Lock-in | None | Platform | Platform |

Next.js keeps full control and the cheapest unit economics but puts owner editing
on us; Framer and Webflow hand owners a visual editor at the cost of per-site
fees and lock-in. Pick by whether v1 sells "done-for-you" (Next.js) or
"edit-it-yourself" (Framer).

## Content & imagery — the silent polish killers

Content and imagery are where "generated" sites give themselves away, so budget
real effort here — not another layout model.

- **Content** — reuse the Needs Analyzer questionnaire (business type, services, tone, differentiators) to write copy and choose sections. The model fills slots; it never designs the page.
- **Imagery** — curated stock keyed by vertical (Unsplash / Pexels) beats generic AI images for trades and retail; art-directed AI images where stock is weak. Treat the client's logo and brand color as first-class inputs.
- **Module slots** — booking, lead capture, quote and intake drop into named slots, so the site ships with working functionality, not just a brochure.

## Effort & resourcing

The gating resource is design talent, not engineering — plan around a designer,
not more code.

- **With a bought substrate / kit:** a credible v1 (one archetype, two themes, AI content, one module slot, deploy) in a few focused weeks.
- **From scratch (designing the system in-house):** add weeks-to-months before the first template ships.
- **Full four archetypes** with theming and imagery: roughly a quarter with a designer in the loop.
- **Ongoing:** each new vertical is mostly content + imagery + a theme, not a new build.

## Phased roadmap

Prove one archetype on pilots before scaling to four. Each phase gates the next.

- **Phase 0 — Decide:** pick the substrate + edit model. _Gate: substrate chosen._
- **Phase 1 — Pilot:** local-trades template, AI copy, one module slot, deploy. _Gate: 3 pilots live & polished._
- **Phase 2 — Expand:** add appointment & professional archetypes; imagery pipeline; custom domains; owner edits. _Gate: repeatable delivery._
- **Phase 3 — Scale:** add retail / hospitality; more themes; self-serve.

## Risks & the v1 cut-line

Three risks sink this; the v1 scope is drawn to dodge them.

- **Generic imagery / content** — the top way sites revert to looking "AI-made." Mitigate with curated per-vertical imagery and intake-driven copy.
- **The editability promise** — owners will want changes; settle the edit model before selling.
- **Layout free-generation creeping back** — keep AI on content and section choice only.

**In v1:** one archetype (local trades), two themes, AI copy from the intake, one
module slot (quote or booking), deploy to a subdomain, three pilot clients.

**Out of v1:** owner visual editing, custom domains, multiple archetypes,
self-serve, e-commerce.

---

_Originally drafted as a Claude doc; committed here for the repo record._
