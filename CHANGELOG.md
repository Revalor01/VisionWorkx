# Changelog

Notable changes to VisionWorkx, newest first.

## Unreleased

- Social content (`/admin/social`) now follows the Revalor Business framework from products.revalorllc.com: VisionWorkx is described as website modules plus automation (Starter $59 / Growth $129 / Pro $299, 14-day trial), not an AI app builder.
- Content calendar generation adds each brand's current product facts (`lib/social/productKnowledge.ts`) to the prompt, and those facts override older positioning in brand voice notes.
- LinkedIn posts can now be written for "Revalor Consulting" as a product (needs migration `20240101000091_linkedin_consulting_product.sql`).
- The weekly recap prompt now describes Revalor's six products across three lines (Business, Kids, Wellness), and its stats still cover only VisionWorkx, Chorebit, FeelFlow and MindBit.
