CREATE TYPE "public"."admin_auth_event_type" AS ENUM('login_password_ok', 'login_failed', 'totp_failed', 'login_success', 'recovery_code_used', 'totp_enrolled', 'step_up_success', 'step_up_failed', 'logout', 'session_revoked', 'password_changed', 'invite_accepted');--> statement-breakpoint
CREATE TYPE "public"."admin_status" AS ENUM('active', 'suspended', 'disabled');--> statement-breakpoint
CREATE TABLE "admin_auth_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid,
	"type" "admin_auth_event_type" NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"role_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_invites_tokenHash_unique" UNIQUE("token_hash"),
	CONSTRAINT "admin_invites_email_lowercase" CHECK ("admin_invites"."email" = lower("admin_invites"."email"))
);
--> statement-breakpoint
CREATE TABLE "admin_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_role_assignments" (
	"admin_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_role_assignments_admin_id_role_id_pk" PRIMARY KEY("admin_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "admin_role_permissions" (
	"role_id" uuid NOT NULL,
	"permission" text NOT NULL,
	CONSTRAINT "admin_role_permissions_role_id_permission_pk" PRIMARY KEY("role_id","permission")
);
--> statement-breakpoint
CREATE TABLE "admin_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"session_version" integer NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip_hash" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_sessions_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"status" "admin_status" DEFAULT 'active' NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"totp_secret_enc" text,
	"totp_pending_secret_enc" text,
	"totp_enabled_at" timestamp with time zone,
	"totp_last_counter" bigint,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_email_unique" UNIQUE("email"),
	CONSTRAINT "admins_email_lowercase" CHECK ("admins"."email" = lower("admins"."email"))
);
--> statement-breakpoint
ALTER TABLE "platform_settings" DROP CONSTRAINT "platform_settings_updated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "kyc_submissions" DROP CONSTRAINT "kyc_submissions_reviewer_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "payouts" DROP CONSTRAINT "payouts_reviewer_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "account_restrictions" DROP CONSTRAINT "account_restrictions_created_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "account_restrictions" DROP CONSTRAINT "account_restrictions_lifted_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "content_reports" DROP CONSTRAINT "content_reports_resolved_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "moderation_actions" DROP CONSTRAINT "moderation_actions_actor_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "platform_settings_history" DROP CONSTRAINT "platform_settings_history_changed_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "risk_cases" DROP CONSTRAINT "risk_cases_assignee_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "risk_rules" DROP CONSTRAINT "risk_rules_updated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "transaction_limits" DROP CONSTRAINT "transaction_limits_updated_by_users_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "actor_type" text;--> statement-breakpoint
-- Data: staff move from users to admins, keeping their ids so every staff-actor column (and the
-- audit log) still points at the same person. The lock keeps role changes and sign-ups out until
-- 0021 has removed them from users (both migrations run in one transaction).
-- audit_logs is append-only, so old rows keep actor_type null; their actor_role tells them apart.
LOCK TABLE "users" IN SHARE ROW EXCLUSIVE MODE;--> statement-breakpoint
INSERT INTO "admin_roles" ("key", "name", "description", "is_system") VALUES
  ('super_admin', 'Super admin', 'Every permission, including managing admins and roles.', true),
  ('support', 'Support', 'Answers creators: looks things up and handles reports.', false),
  ('compliance', 'Compliance', 'Identity checks, product review, risk cases and account restrictions.', false),
  ('finance', 'Finance', 'Payments, withdrawals and the Monime operations behind them.', false);--> statement-breakpoint
INSERT INTO "admin_role_permissions" ("role_id", "permission")
SELECT r."id", p.permission FROM "admin_roles" r
JOIN (VALUES
  ('support', ARRAY['overview.view','creators.view','transactions.view','payouts.view','products.view','reports.view','reports.resolve']),
  ('compliance', ARRAY['overview.view','creators.view','creators.status','transactions.view','kyc.view','kyc.decide','products.view','products.review','reports.view','reports.resolve','risk.view','risk.cases','limits.view','audit.view']),
  ('finance', ARRAY['overview.view','creators.view','transactions.view','payments.manage','payouts.view','payouts.approve','payouts.reject','payouts.operate','webhooks.view','webhooks.replay','limits.view','settings.view'])
) AS seed("key", permissions) ON seed."key" = r."key"
CROSS JOIN LATERAL unnest(seed.permissions) AS p(permission);--> statement-breakpoint
-- A staff account without a password (Google-only) gets an unusable hash: set one with db:seed:admin.
INSERT INTO "admins" ("id", "email", "name", "password_hash", "status", "created_at")
SELECT "id", "email", coalesce(nullif("name", ''), split_part("email", '@', 1)), coalesce("password_hash", '!'),
  (CASE WHEN "status" IN ('active', 'restricted') THEN 'active' ELSE 'suspended' END)::"admin_status", "created_at"
FROM "users" WHERE "role" IN ('staff', 'super_admin');--> statement-breakpoint
-- Former staff (since demoted) who still appear in a staff column: kept as disabled admins with no
-- roles and no password, so that history keeps a valid foreign key.
INSERT INTO "admins" ("id", "email", "name", "password_hash", "status", "created_at")
SELECT u."id", u."email", coalesce(nullif(u."name", ''), split_part(u."email", '@', 1)), '!', 'disabled', u."created_at"
FROM "users" u
WHERE u."role" = 'creator' AND u."id" IN (
    SELECT "updated_by" FROM "platform_settings"
    UNION SELECT "changed_by" FROM "platform_settings_history"
    UNION SELECT "reviewer_id" FROM "kyc_submissions"
    UNION SELECT "reviewer_id" FROM "payouts"
    UNION SELECT "created_by" FROM "account_restrictions"
    UNION SELECT "lifted_by" FROM "account_restrictions"
    UNION SELECT "resolved_by" FROM "content_reports"
    UNION SELECT "actor_id" FROM "moderation_actions"
    UNION SELECT "assignee_id" FROM "risk_cases"
    UNION SELECT "updated_by" FROM "risk_rules"
    UNION SELECT "updated_by" FROM "transaction_limits"
)
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "admin_role_assignments" ("admin_id", "role_id")
SELECT u."id", r."id" FROM "users" u
JOIN "admin_roles" r ON (u."role" = 'super_admin' AND r."key" = 'super_admin')
  OR (u."role" = 'staff' AND r."key" IN ('support', 'compliance', 'finance'));--> statement-breakpoint
ALTER TABLE "admin_auth_events" ADD CONSTRAINT "admin_auth_events_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_invites" ADD CONSTRAINT "admin_invites_invited_by_admins_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_recovery_codes" ADD CONSTRAINT "admin_recovery_codes_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_role_assignments" ADD CONSTRAINT "admin_role_assignments_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_role_assignments" ADD CONSTRAINT "admin_role_assignments_role_id_admin_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."admin_roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_role_assignments" ADD CONSTRAINT "admin_role_assignments_assigned_by_admins_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_role_permissions" ADD CONSTRAINT "admin_role_permissions_role_id_admin_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."admin_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_auth_events_admin_id_created_at_index" ON "admin_auth_events" USING btree ("admin_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_invites_one_open_per_email" ON "admin_invites" USING btree ("email") WHERE "admin_invites"."accepted_at" is null and "admin_invites"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_recovery_codes_admin_id_code_hash_index" ON "admin_recovery_codes" USING btree ("admin_id","code_hash");--> statement-breakpoint
CREATE INDEX "admin_role_assignments_role_id_index" ON "admin_role_assignments" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "admin_sessions_admin_id_revoked_at_index" ON "admin_sessions" USING btree ("admin_id","revoked_at");--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_admins_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD CONSTRAINT "kyc_submissions_reviewer_id_admins_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_reviewer_id_admins_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_restrictions" ADD CONSTRAINT "account_restrictions_created_by_admins_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_restrictions" ADD CONSTRAINT "account_restrictions_lifted_by_admins_id_fk" FOREIGN KEY ("lifted_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_resolved_by_admins_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_actor_id_admins_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_settings_history" ADD CONSTRAINT "platform_settings_history_changed_by_admins_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_cases" ADD CONSTRAINT "risk_cases_assignee_id_admins_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_rules" ADD CONSTRAINT "risk_rules_updated_by_admins_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_limits" ADD CONSTRAINT "transaction_limits_updated_by_admins_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;