-- Dunning + trial-ending notifications (once per episode).
alter table public.subscriptions
  add column if not exists trial_ending_notified_at timestamptz,
  add column if not exists payment_failed_notified_at timestamptz;

comment on column public.subscriptions.trial_ending_notified_at is
  'Set when the "trial ends soon" email was sent for this trial; prevents repeats.';
comment on column public.subscriptions.payment_failed_notified_at is
  'Set on invoice.payment_failed dunning email; cleared on the next invoice.paid.';
