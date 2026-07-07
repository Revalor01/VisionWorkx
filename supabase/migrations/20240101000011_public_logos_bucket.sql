-- =============================================================
-- Vision Workx — Make the logos bucket public (Migration 11)
-- =============================================================
--
-- logoPath has been captured in intake_data since onboarding was built,
-- but was never actually threaded into the generation prompt — uploaded
-- logos had zero effect on the generated app. Fixing that means the
-- generated app (running with only its own tenant-scoped anon key, no
-- relationship to this bucket's RLS) needs to be able to load the image
-- via a plain public URL. Business logos are meant to be displayed
-- publicly on the customer's own site anyway, so making the bucket
-- public is the right tradeoff — simpler and more robust than signed
-- URLs (which expire) or embedding the binary at deploy time.

update storage.buckets set public = true where id = 'logos';
