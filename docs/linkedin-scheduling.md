# LinkedIn scheduling (Zapier)

Approved LinkedIn posts in **/admin/social → LinkedIn** can be scheduled. A free Zapier Zap reads a
token-protected RSS feed and posts them to **two LinkedIn accounts**: the **Revalor LLC** company
page and the owner's **personal profile** (one Zap per account, each with its own feed URL).

Nothing is posted unless a person **approved** the post **and** scheduled it. The autonomous
social crons (`social-generate`, `social-publish`) never touch `linkedin_posts`.

## Using it

1. Approve the post (Approve button on the card).
2. Pick a date and time (default: next Tuesday 9:00am local) and click **Schedule**. The card shows
   a `Scheduled · <time>` badge, then `Sending via Zapier` once that time arrives.
3. Click **Unschedule** at any time before it goes out. Moving a post back to draft also clears
   its schedule.

Zapier posts the hook, caption, a tracked link to the product's page (`Learn more: …/go/<code>`,
skipped if the caption already links to products.revalorllc.com) and `#hashtags`, whatever the
post's product, plus the post's image if it has one. **Videos aren't sent**, so post anything that needs its video by hand (Copy
caption + hashtags → Mark as posted).

### Image (optional)

Each post can have one JPG or PNG image, up to 5 MB. On the post card use **Upload image**, then
**Replace image** or **Remove image**; the card shows a preview. Replaced or removed images stay in
the bucket (there's no cleanup).

## Automation controls

The **Automation** box on the LinkedIn tab (table `linkedin_automation`, migration
`20240101000111_vw_linkedin_automation.sql`, one row `id = 1`):

- **On / Paused** button. Paused = the feed serves no items, so neither Zap posts anything and nothing
  is marked posted. Scheduled posts wait; on resume, anything due in the last 48 hours goes out, and
  older ones show **Missed: reschedule**.
- **How often**: weekly (Tue 9am), twice a week (Tue + Thu 9am) or every other week (Tue 9am, anchored
  on Tue 24 Nov 2026). Sets the Schedule picker's default and the slots **Fill open slots** uses.
- **Run for**: no end, or 2 / 4 / 8 / 12 weeks from today (`ends_at`). After it, the feed behaves as
  paused.
- **Fill open slots**: schedules approved, unscheduled posts (oldest first) into the next free cadence
  slots before the end date. It never approves or writes posts.
- API: `GET` / `PUT /api/social/linkedin/automation` (admin only). If the table is missing the app uses
  the defaults (on, weekly, no end).

LinkedIn posts (approved, scheduled or posted) also show on **/admin/social → Calendar** (LinkedIn filter).

## How it works

- Column `linkedin_posts.scheduled_at` (nullable timestamptz, migration
  `20240101000109_vw_linkedin_scheduled_at.sql`).
- Column `linkedin_posts.image_path` (nullable text, migration
  `20240101000110_vw_linkedin_image.sql`; additive and idempotent). Images live in the existing
  private `social-content-images` bucket at `linkedin/<post id>/<uuid>.<ext>`.
- `PATCH /api/social/linkedin/[id]` accepts `scheduledAt` (ISO string or `null`), only on
  approved posts, and `imagePath` (or `null` to remove). The path must be in that post's folder,
  and the server checks the stored file is JPG/PNG and at most 5 MB (storage info) before saving.
- Admin-only image routes: `POST /api/social/linkedin/[id]/image-upload-url` (signed upload link)
  and `GET /api/social/linkedin/[id]/image-url` (5-minute preview link).
- `GET /api/social/linkedin/feed?token=<LINKEDIN_FEED_TOKEN>` returns RSS 2.0 of approved posts
  whose `scheduled_at` is in the last 48 hours and not in the future. A wrong or missing token, or
  an unset `LINKEDIN_FEED_TOKEN`, gets a 404.
  - `<description>`: hook + caption + hashtags (the hook is skipped when the caption already
    starts with it).
  - `<guid>`: `linkedin-<id>-<scheduled ms>`. A rescheduled post becomes a new item, and the same
    schedule never repeats.
  - `<enclosure>`: for posts with an image, a 1-hour signed link with `type` `image/jpeg` or
    `image/png`. If the link can't be made, that post goes out text-only.
- `&account=page` (default, so a feed URL without it is the company page) or `&account=profile`.
  Each account gets its own tracked link per post: a `short_links` row with
  `platform = linkedin_page | linkedin_profile` and `campaign = linkedin:<post id>`, pointing at
  the product page with `utm_source=linkedin&utm_content=<account>`. It's added to the text and is
  the item's `<link>`. Clicks are counted on **Performance** (LinkedIn card + two "By platform" rows).
- The feed lists approved posts **and** posts the feed itself marked posted
  (`posted_at = scheduled_at`), so the second Zap still sees a post after the first account's read
  marked it. A post marked posted by hand (different `posted_at`) is never sent.
- Zapier can't report back, so each time the feed is read, any post that has been due for
  30+ minutes is marked `posted` (`posted_at = scheduled_at`). This only happens if the post is
  still approved and its `scheduled_at` hasn't changed.
- Code: `lib/social/linkedinFeed.ts` (+ `.test.ts`), `lib/social/linkedinImage.ts` (+ `.test.ts`),
  `app/api/social/linkedin/feed/route.ts`, `app/api/social/linkedin/[id]/image-upload-url/`,
  `app/api/social/linkedin/[id]/image-url/`, `app/admin/social/LinkedInTab.tsx`.

## Zapier setup (free plan)

1. Set `LINKEDIN_FEED_TOKEN` in Vercel to a long random string.
2. **Zap 1: company page.**
   - **Trigger:** RSS by Zapier → **New Item in Feed**, Feed URL
     `https://<app host>/api/social/linkedin/feed?token=<LINKEDIN_FEED_TOKEN>&account=page`
     (the older URL without `&account=` still means the page).
   - **Action:** LinkedIn → **Create Company Update**, company **Revalor LLC**,
     Update Content = the item's **Description**, Image = the item's **Enclosure URL**, Image
     Type = **post_media**.
3. **Zap 2: personal profile.** A separate Zap, so this works even on plans limited to two-step Zaps.
   - **Trigger:** RSS by Zapier → **New Item in Feed**, Feed URL
     `https://<app host>/api/social/linkedin/feed?token=<LINKEDIN_FEED_TOKEN>&account=profile`.
   - **Action:** LinkedIn → **Create Share Update**, Comment = the item's **Description**,
     Visible To = **Anyone**. Optional link card: Content - URL = the item's **Link**,
     Content - Image URL = the item's **Enclosure URL**. LinkedIn's personal-profile action can't
     attach an image as post media, only as a link-card thumbnail.
4. **Turn both Zaps on before you schedule the first post.** Zapier skips items that are already in
   the feed when the Zap is turned on.

Each post uses one Zapier task per account (two per post), out of the free plan's monthly tasks.

The free plan polls about every 15 minutes, so a post goes out up to about 15 minutes after its
scheduled time.

## Caveats

- If the Zap is off or failing, posts are still marked `posted` 30 minutes after they're due
  whenever the feed is read, even though nothing reached LinkedIn. Check the Zap history if a
  post is missing.
- If nothing reads the feed, due posts stay `approved` and are never marked posted.
- Posts more than 48 hours past due drop out of the feed and won't be sent.

## QA

`visionworkx/social/linkedin-feed-requires-token`, `visionworkx/social/linkedin-schedule-requires-admin`,
`visionworkx/social/linkedin-image-requires-admin`, `visionworkx/social/linkedin-automation-requires-admin`.
