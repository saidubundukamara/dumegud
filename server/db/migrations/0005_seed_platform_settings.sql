-- PLACEHOLDER values (PRD §6.2 / §9: fees and limits are not approved yet; the PRD's working
-- hypothesis is 3% on contributions and 5% on product sales). Staff change them
-- in the admin settings editor (Phase 8) without a deploy. Re-running is safe.
INSERT INTO "platform_settings" ("key", "value") VALUES
  ('fees.contributionBps', '300'),
  ('fees.productBps', '500'),
  ('fees.monimeCollectionBpsEstimate', '100'),
  ('amounts.minContribution', '1000'),
  ('amounts.maxContribution', '50000')
ON CONFLICT ("key") DO NOTHING;
