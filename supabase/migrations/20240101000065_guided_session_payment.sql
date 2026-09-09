-- $10 Stripe Checkout for the Guided Build Session. The request row is
-- filed unpaid on form submit; these columns record the one-time payment
-- once Checkout completes. The $10 is added back as a customer balance
-- credit so it comes off the first subscription invoice.

alter table guided_session_requests add column if not exists paid_at timestamptz;
alter table guided_session_requests add column if not exists stripe_session_id text;
alter table guided_session_requests add column if not exists stripe_customer_id text;

comment on table guided_session_requests is 'guided build session requests + $10 one-time payment';
