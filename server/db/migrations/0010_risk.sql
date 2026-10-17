CREATE TYPE "public"."alert_severity" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('open', 'dismissed', 'escalated', 'actioned');--> statement-breakpoint
CREATE TYPE "public"."alert_subject" AS ENUM('creator', 'payment', 'payout', 'product');--> statement-breakpoint
CREATE TYPE "public"."risk_case_decision" AS ENUM('dismiss', 'request_info', 'restrict', 'pause_feature', 'escalate', 'restore');--> statement-breakpoint
CREATE TYPE "public"."risk_case_status" AS ENUM('open', 'info_requested', 'escalated', 'awaiting_approval', 'closed');--> statement-breakpoint
CREATE TYPE "public"."limit_action" AS ENUM('block', 'review', 'flag');--> statement-breakpoint
CREATE TYPE "public"."limit_scope" AS ENUM('per_contribution', 'supporter_to_creator', 'supporter_global', 'creator_receipts', 'creator_payouts', 'velocity_count');--> statement-breakpoint
CREATE TYPE "public"."limit_window" AS ENUM('single', '24h', '7d', '30d');--> statement-breakpoint
CREATE TYPE "public"."report_reason" AS ENUM('scam', 'impersonation', 'copyright', 'illegal', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'dismissed', 'actioned');--> statement-breakpoint
CREATE TYPE "public"."report_target" AS ENUM('creator', 'product');--> statement-breakpoint
CREATE TYPE "public"."restriction_feature" AS ENUM('receive', 'withdraw', 'publish', 'upload', 'all');--> statement-breakpoint
CREATE TABLE "account_restrictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"feature" "restriction_feature" NOT NULL,
	"reason" text NOT NULL,
	"case_id" uuid,
	"created_by" uuid,
	"expires_at" timestamp with time zone,
	"lifted_at" timestamp with time zone,
	"lifted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_role" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" "report_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" "report_reason" NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"reporter_email_hash" text,
	"ip_hash" text,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"version" integer NOT NULL,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_code" text NOT NULL,
	"subject_type" "alert_subject" NOT NULL,
	"subject_id" uuid NOT NULL,
	"creator_id" uuid,
	"severity" "alert_severity" NOT NULL,
	"evidence" jsonb NOT NULL,
	"status" "alert_status" DEFAULT 'open' NOT NULL,
	"case_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"reason_codes" text[] DEFAULT '{}'::text[] NOT NULL,
	"assignee_id" uuid,
	"status" "risk_case_status" DEFAULT 'open' NOT NULL,
	"decision" "risk_case_decision",
	"decision_notes" text,
	"pending_decision" jsonb,
	"approvals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_rules" (
	"code" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"params" jsonb NOT NULL,
	"severity" "alert_severity" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "limit_scope" NOT NULL,
	"window" "limit_window" NOT NULL,
	"verification_tier" "creator_verification_tier",
	"risk_tier" "creator_risk_tier",
	"rail" text,
	"max_amount_minor" bigint,
	"max_count" integer,
	"action" "limit_action" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "review_hold" text;--> statement-breakpoint
ALTER TABLE "account_restrictions" ADD CONSTRAINT "account_restrictions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_restrictions" ADD CONSTRAINT "account_restrictions_case_id_risk_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."risk_cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_restrictions" ADD CONSTRAINT "account_restrictions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_restrictions" ADD CONSTRAINT "account_restrictions_lifted_by_users_id_fk" FOREIGN KEY ("lifted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_settings_history" ADD CONSTRAINT "platform_settings_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_alerts" ADD CONSTRAINT "risk_alerts_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_alerts" ADD CONSTRAINT "risk_alerts_case_id_risk_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."risk_cases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_cases" ADD CONSTRAINT "risk_cases_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_cases" ADD CONSTRAINT "risk_cases_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_rules" ADD CONSTRAINT "risk_rules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_limits" ADD CONSTRAINT "transaction_limits_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_restrictions_user_id_lifted_at_index" ON "account_restrictions" USING btree ("user_id","lifted_at");--> statement-breakpoint
CREATE INDEX "audit_logs_target_type_target_id_created_at_index" ON "audit_logs" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_id_created_at_index" ON "audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "content_reports_status_created_at_index" ON "content_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "content_reports_target_type_target_id_index" ON "content_reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "platform_settings_history_key_version_index" ON "platform_settings_history" USING btree ("key","version");--> statement-breakpoint
CREATE INDEX "risk_alerts_status_created_at_index" ON "risk_alerts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "risk_alerts_rule_code_subject_id_created_at_index" ON "risk_alerts" USING btree ("rule_code","subject_id","created_at");--> statement-breakpoint
CREATE INDEX "risk_alerts_creator_id_index" ON "risk_alerts" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "risk_cases_status_created_at_index" ON "risk_cases" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "risk_cases_creator_id_index" ON "risk_cases" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "transaction_limits_scope_active_index" ON "transaction_limits" USING btree ("scope","active");