-- PLACEHOLDER: payouts at or above this need two different staff approvals to release.
INSERT INTO "platform_settings" ("key", "value") VALUES ('payouts.dualApprovalMin', '500000')
ON CONFLICT ("key") DO NOTHING;
