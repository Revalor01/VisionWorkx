# LinkedIn scheduling (Zapier)

Approved LinkedIn posts in **/admin/social → LinkedIn** can be scheduled. A free Zapier Zap reads a
token-protected RSS feed and posts them to the **Revalor LLC** company page.

Nothing is posted unless a person **approved** the post **and** scheduled it. The autonomous
social crons (`social-generate`, `social-publish`) never touch `linkedin_posts`.

## Using it

1. Approve the post (Approve button on the card).
2. Pick a date and time (default: next Tuesday 9:00am local) and click **Schedule**. The card shows
   a `Scheduled · <time>` badge, then `Sending via Zapier` once that time arrives.
3. Click **Unschedule** at any time before it goes out. Moving a post back to draft also clears
   its schedule.

Zapier posts the hook, caption and `#hashtags`, whatever the post's product. **Videos aren't
sent**, so post anything that needs its video by hand (Copy caption + hashtags → Mark as posted).

## How it works

- Column `linkedin_posts.scheduled_at` (nullable timestamptz, migration
  `20240101000109_vw_linkedin_scheduled_at.sql`).
- `PATCH /api/social/linkedin/[id]` accepts `scheduledAt` (ISO string or `null`), only on
  approved posts.
- `GET /api/social/linkedin/feed?token=<LINKEDIN_FEED_TOKEN>` returns RSS 2.0 of approved posts
  whose `scheduled_at` is in the last 48 hours and not in the future. A wrong or missing token, or
  an unset `LINKEDIN_FEED_TOKEN`, gets a 404.
  - `<description>`: hook + caption + hashtags (the hook is skipped when the caption already
    starts with it).
  - `<guid>`: `linkedin-<id>-<scheduled ms>`. A rescheduled post becomes a new item, and the same
    schedule never repeats.
- Zapier can't report back, so each time the feed is read, any post that has been due for
  30+ minutes is marked `posted` (`posted_at = scheduled_at`). This only happens if the post is
  still approved and its `scheduled_at` hasn't changed.
- Code: `lib/social/linkedinFeed.ts` (+ `.test.ts`), `app/api/social/linkedin/feed/route.ts`,
  `app/admin/social/LinkedInTab.tsx`.

## Zapier setup (free plan)

1. Set `LINKEDIN_FEED_TOKEN` in Vercel to a long random string.
2. Create a Zap:
   - **Trigger:** RSS by Zapier → **New Item in Feed**, Feed URL
     `https://<app host>/api/social/linkedin/feed?token=<LINKEDIN_FEED_TOKEN>`.
   - **Action:** LinkedIn → **Create Company Update**, company **Revalor LLC**,
     Update Content = the item's **Description**.
3. **Turn the Zap on before you schedule the first post.** Zapier skips items that are already in
   the feed when the Zap is turned on.

The free plan polls about every 15 minutes, so a post goes out up to about 15 minutes after its
scheduled time.

## Caveats

- If the Zap is off or failing, posts are still marked `posted` 30 minutes after they're due
  whenever the feed is read, even though nothing reached LinkedIn. Check the Zap history if a
  post is missing.
- If nothing reads the feed, due posts stay `approved` and are never marked posted.
- Posts more than 48 hours past due drop out of the feed and won't be sent.

## QA

`visionworkx/social/linkedin-feed-requires-token`, `visionworkx/social/linkedin-schedule-requires-admin`.
