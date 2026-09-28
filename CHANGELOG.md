# Changelog

Notable changes to VisionWorkx, newest first.

## Unreleased

- Linting works again: ESLint moved to a v9 flat config (`eslint.config.mjs`, replacing `.eslintrc.json`) because Next 16 removed `next lint`; `npm run lint` now runs `eslint .`.
- Lint skips code that isn't the app's own Next.js source: `templates/**`, `supabase/functions/**`, `public/embed.js` and `lib/apps/baseTemplate.generated.ts`.
- The newer React Compiler-era react-hooks rules (`set-state-in-effect`, `purity`, `immutability`, `use-memo`, `preserve-manual-memoization`) are warnings for now; about 34 hits remain to fix file by file.
- CI (`.github/workflows/ci.yml`) now runs a Lint step after Typecheck, so lint errors fail the check.
- Social content (`/admin/social`) now follows the Revalor Business framework from products.revalorllc.com: VisionWorkx is described as website modules plus automation (Starter $59 / Growth $129 / Pro $299, 14-day trial), not an AI app builder.
- Content calendar generation adds each brand's current product facts (`lib/social/productKnowledge.ts`) to the prompt, and those facts override older positioning in brand voice notes.
- The "Revalor LLC" social brand now gets product facts for the three Revalor Business products (VisionWorkx, Proactive, Revalor Consulting); the earlier mapping keyed on a "Revalor Business" brand name that doesn't exist.
- LinkedIn posts can now be written for "Revalor Consulting" as a product (needs migration `20240101000091_linkedin_consulting_product.sql`).
- The weekly recap prompt now describes Revalor's six products across three lines (Business, Kids, Wellness), and its stats still cover only VisionWorkx, Chorebit, FeelFlow and MindBit.
