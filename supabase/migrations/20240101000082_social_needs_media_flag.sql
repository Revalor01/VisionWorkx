-- Adds a "needs_media" autonomy-flag kind.
--
-- Root cause (found 2026-09-16): the autonomous content-generation cron
-- (app/api/cron/social-generate) writes caption/hashtags only — it has no
-- way to attach an image or video, since generateContentImage/video are
-- both manual per-post dashboard actions. But publishPost.ts correctly
-- requires media for Instagram/TikTok/YouTube, so every autonomously
-- scheduled post on those platforms was guaranteed to fail at publish
-- time. That publish failure pauses the WHOLE brand's autonomy (not just
-- the offending platform), which blocked even Facebook (which doesn't
-- need media) until a human noticed and resumed it — Revalor LLC hit this
-- exact cycle repeatedly from 2026-09-04 to 2026-09-16, never actually
-- fixed, just re-triggered every time it was resumed.
--
-- Fix: catch this at GENERATE time instead of publish time. The generate
-- cron now routes any post for a media-requiring platform straight to
-- "draft" and raises this new flag kind (no brand pause, no interruption
-- to the rest of that run) instead of auto-scheduling something that's
-- certain to fail. A human finishes it from the dashboard the same way
-- manual-mode drafts already work today.

alter table public.social_autonomy_flags
  drop constraint social_autonomy_flags_kind_check;

alter table public.social_autonomy_flags
  add constraint social_autonomy_flags_kind_check
    check (kind in ('banned_word', 'high_risk', 'publish_failure', 'inbox_escalation', 'needs_media'));
