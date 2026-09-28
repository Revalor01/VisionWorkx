# Changelog

Notable changes to VisionWorkx, newest first.

## Unreleased

- Security: closed open redirects via `?next=` on `/login` and `/signup` (e.g. `/login?next=https://evil.example` no longer sends a signed-in user off-site) and a `/\host` gap in the admin SSO consume route (`app/api/admin/sso/consume`); only same-origin paths are followed now, otherwise the user lands on `/dashboard` (or `/admin` for SSO). Workspace login (`/workspace/login`) and its magic-link callback (`/workspace/auth/callback`) now get the same protections and must also stay inside `/workspace` (e.g. `/workspace/../admin` or `/workspaces-x` now land on `/workspace`).
- For developers: any user-supplied redirect target must go through `safeNextPath(value, fallback)` from `lib/safeRedirect.ts`, which returns a same-origin path or the fallback (it rejects absolute and protocol-relative URLs, backslashes, control characters, inputs over 2048 chars, anything that parses to another origin, and paths that collapse to `//` via dot segments). For redirects that must stay within one area, use `safeNextPathWithin(value, area)` (e.g. `area = "/workspace"`): same checks, and the resolved path must be the area itself or under it, otherwise it returns the area.
- Linting works again: ESLint moved to a v9 flat config (`eslint.config.mjs`, replacing `.eslintrc.json`) because Next 16 removed `next lint`; `npm run lint` now runs `eslint .`.
- Lint skips code that isn't the app's own Next.js source: `templates/**`, `supabase/functions/**`, `public/embed.js` and `lib/apps/baseTemplate.generated.ts`.
- The newer React Compiler-era react-hooks rules (`set-state-in-effect`, `purity`, `immutability`, `use-memo`, `preserve-manual-memoization`) are errors again: all 35 warnings they raised (plus one `exhaustive-deps`) were fixed across admin screens, workspace/billing/generate pages and customer-facing components, and the temporary warn-downgrade was removed, so a new violation fails lint and CI.
- New `lib/hooks.ts` for developers: `useOnChange(value, fn)` adjusts state during render when a value changes (use it instead of `setState` inside a `useEffect`), and `useNow(intervalMs)` gives a ticking clock (use it instead of `Date.now()` during render in client components).
- Server components that read the clock per request keep `Date.now()` with a commented `eslint-disable` for `react-hooks/purity`.
- Behaviour notes from those fixes: the admin Payments tab still retries on re-open until one load succeeds; the admin Marketing and Mobile dashboards, the social Performance tab and the booking widget now ignore stale fetch responses.
- CI (`.github/workflows/ci.yml`) now runs a Lint step after Typecheck, so lint errors fail the check.
- Social content (`/admin/social`) now follows the Revalor Business framework from products.revalorllc.com: VisionWorkx is described as website modules plus automation (Starter $59 / Growth $129 / Pro $299, 14-day trial), not an AI app builder.
- Content calendar generation adds each brand's current product facts (`lib/social/productKnowledge.ts`) to the prompt, and those facts override older positioning in brand voice notes.
- The "Revalor LLC" social brand now gets product facts for the three Revalor Business products (VisionWorkx, Proactive, Revalor Consulting); the earlier mapping keyed on a "Revalor Business" brand name that doesn't exist.
- LinkedIn posts can now be written for "Revalor Consulting" as a product (needs migration `20240101000091_linkedin_consulting_product.sql`).
- The weekly recap prompt now describes Revalor's six products across three lines (Business, Kids, Wellness), and its stats still cover only VisionWorkx, Chorebit, FeelFlow and MindBit.
