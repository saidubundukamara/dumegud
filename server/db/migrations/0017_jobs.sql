CREATE TYPE "public"."job_run_status" AS ENUM('running', 'succeeded', 'failed', 'skipped');--> statement-breakpoint
ALTER TYPE "public"."alert_subject" ADD VALUE 'platform';--> statement-breakpoint
CREATE TABLE "job_leases" (
	"name" text PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"locked_until" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" "job_run_status" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"processed" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"detail" jsonb,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "product_assets" ADD COLUMN "purged_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "job_runs_name_started_at_index" ON "job_runs" USING btree ("name","started_at");--> statement-breakpoint
CREATE INDEX "job_runs_started_at_index" ON "job_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "payments_transfer_retry_index" ON "payments" USING btree ("transfer_status","updated_at") WHERE "payments"."status" = 'succeeded' and "payments"."transfer_status" <> 'completed';--> statement-breakpoint
-- PLACEHOLDER: ledger-drift cron tolerance (minor units) before a LEDGER_DRIFT alert is raised.
INSERT INTO "platform_settings" ("key", "value") VALUES ('jobs.ledgerDriftToleranceMinor', '100')
ON CONFLICT ("key") DO NOTHING;