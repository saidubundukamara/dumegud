-- PLACEHOLDER payout settings (PRD §5.6/§13: payout rules are not approved yet).
-- Operator prefixes (Sierra Leone, local part after 232): verify with Monime/the MNOs before
-- launch; staff can edit them without a deploy.
INSERT INTO "platform_settings" ("key", "value") VALUES
  ('fees.monimePayoutBpsEstimate', '100'),
  ('payouts.min', '5000'),
  ('payouts.autoApproveMax', '100000'),
  ('payouts.killSwitch', 'false'),
  ('payoutMethods.firstCooldownHours', '24'),
  ('payoutMethods.changeCooldownHours', '48'),
  ('kyc.nameMatchEnforced', 'true'),
  ('phone.operatorPrefixes', '{"m17": ["72", "73", "74", "75", "76", "78", "79"], "m18": ["30", "33", "34", "77", "80", "88", "99"]}')
ON CONFLICT ("key") DO NOTHING;
