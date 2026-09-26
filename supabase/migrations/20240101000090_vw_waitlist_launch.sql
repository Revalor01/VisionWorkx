-- VisionWorkx waitlist launch email: track who has been sent it and who has
-- unsubscribed (via the signed link on products.revalorllc.com). Additive only.
alter table public.vw_waitlist
  add column if not exists launch_email_sent_at timestamptz,
  add column if not exists unsubscribed_at      timestamptz;
