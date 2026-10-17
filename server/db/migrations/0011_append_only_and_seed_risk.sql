-- Append-only tables: reject UPDATE and DELETE for every role (implementation.md §4, Appendix D).
-- Corrections are new rows. TRUNCATE is not a row operation and stays available to the owner.
CREATE OR REPLACE FUNCTION dumegud_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION dumegud_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON "ledger_entries" FOR EACH ROW EXECUTE FUNCTION dumegud_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER ledger_journals_append_only BEFORE UPDATE OR DELETE ON "ledger_journals" FOR EACH ROW EXECUTE FUNCTION dumegud_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER payment_events_append_only BEFORE UPDATE OR DELETE ON "payment_events" FOR EACH ROW EXECUTE FUNCTION dumegud_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER download_events_append_only BEFORE UPDATE OR DELETE ON "download_events" FOR EACH ROW EXECUTE FUNCTION dumegud_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER platform_settings_history_append_only BEFORE UPDATE OR DELETE ON "platform_settings_history" FOR EACH ROW EXECUTE FUNCTION dumegud_reject_mutation();
--> statement-breakpoint

-- Risk rules (PRD §6.3). PLACEHOLDER parameters; staff tune them in admin.
INSERT INTO "risk_rules" ("code", "description", "params", "severity") VALUES
  ('RAPID_REPEAT', 'Many payments from one payer to one creator in a short time', '{"count": 10, "minutes": 60}', 'medium'),
  ('JUST_BELOW_THRESHOLD', 'Repeated payments just under the per-contribution limit', '{"withinPercent": 10, "count": 3, "hours": 24}', 'medium'),
  ('SAME_PAYER_CONCENTRATION', 'One payer makes up most of a creator''s receipts', '{"sharePercent": 80, "minTotalMinor": 100000, "days": 7}', 'medium'),
  ('NEW_CREATOR_SPIKE', 'A new creator receiving unusually high volume', '{"accountAgeDays": 14, "receipts24hMinor": 200000}', 'high'),
  ('PAYOUT_DETAIL_CHURN', 'Repeated payout number changes', '{"changes": 2, "days": 30}', 'high'),
  ('FAILURE_SPIKE', 'Many failed or abandoned payments to one creator', '{"count": 10, "minutes": 60}', 'low'),
  ('SELF_FUNDING', 'Payments from a network the creator signs in from', '{"days": 30}', 'medium')
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint

INSERT INTO "platform_settings" ("key", "value") VALUES ('risk.dualApprovalMinBalance', '100000')
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint

-- Example limits from PRD §6.2 (ILLUSTRATIVE, NOT APPROVED). Staff edit them in admin.
INSERT INTO "transaction_limits" ("scope", "window", "max_amount_minor", "max_count", "action") VALUES
  ('per_contribution', 'single', 50000, NULL, 'block'),
  ('supporter_to_creator', '24h', 100000, NULL, 'review'),
  ('creator_receipts', '24h', 200000, NULL, 'review'),
  ('velocity_count', '24h', NULL, 30, 'block');
