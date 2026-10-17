CREATE TYPE "public"."kyc_id_type" AS ENUM('national_id', 'passport', 'drivers_license', 'voter_id');--> statement-breakpoint
CREATE TYPE "public"."kyc_status" AS ENUM('pending', 'approved', 'rejected', 'needs_more_info');--> statement-breakpoint
CREATE TYPE "public"."momo_provider" AS ENUM('m17', 'm18');--> statement-breakpoint
CREATE TYPE "public"."name_match" AS ENUM('match', 'partial', 'mismatch', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."payout_method_status" AS ENUM('cooling_off', 'active', 'needs_recheck', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('requested', 'in_review', 'processing', 'completed', 'failed', 'canceled');--> statement-breakpoint
CREATE TABLE "kyc_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"legal_name_enc" text NOT NULL,
	"date_of_birth_enc" text NOT NULL,
	"id_type" "kyc_id_type" NOT NULL,
	"id_number_hash" text NOT NULL,
	"id_front_key" text NOT NULL,
	"id_back_key" text,
	"selfie_key" text NOT NULL,
	"status" "kyc_status" DEFAULT 'pending' NOT NULL,
	"reviewer_id" uuid,
	"review_notes" text,
	"rejection_reason_code" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text DEFAULT 'momo' NOT NULL,
	"provider_id" "momo_provider" NOT NULL,
	"msisdn_enc" text NOT NULL,
	"msisdn_hash" text NOT NULL,
	"msisdn_last3" text NOT NULL,
	"holder_name" text,
	"name_match" "name_match" NOT NULL,
	"status" "payout_method_status" NOT NULL,
	"cooldown_until" timestamp with time zone,
	"bound_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"payout_method_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"quoted_fee_minor" bigint NOT NULL,
	"fee_minor" bigint,
	"fee_source" "monime_fee_source",
	"total_debit_minor" bigint,
	"currency" text DEFAULT 'SLE' NOT NULL,
	"status" "payout_status" NOT NULL,
	"review_reason" text,
	"monime_payout_id" text,
	"idempotency_key" text NOT NULL,
	"last_error" text,
	"failure_code" text,
	"failure_message" text,
	"completion_applied" boolean DEFAULT false NOT NULL,
	"destination_snapshot" jsonb NOT NULL,
	"holder_name_at_request" text,
	"reviewer_id" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_monimePayoutId_unique" UNIQUE("monime_payout_id"),
	CONSTRAINT "payouts_idempotencyKey_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "payouts_amount_positive" CHECK ("payouts"."amount_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD CONSTRAINT "kyc_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_submissions" ADD CONSTRAINT "kyc_submissions_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_methods" ADD CONSTRAINT "payout_methods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_payout_method_id_payout_methods_id_fk" FOREIGN KEY ("payout_method_id") REFERENCES "public"."payout_methods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kyc_submissions_user_id_created_at_index" ON "kyc_submissions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "kyc_submissions_status_created_at_index" ON "kyc_submissions" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "kyc_one_approved_per_document" ON "kyc_submissions" USING btree ("id_number_hash") WHERE "kyc_submissions"."status" = 'approved';--> statement-breakpoint
CREATE UNIQUE INDEX "kyc_one_open_per_user" ON "kyc_submissions" USING btree ("user_id") WHERE "kyc_submissions"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "payout_methods_one_current_per_user" ON "payout_methods" USING btree ("user_id") WHERE "payout_methods"."status" <> 'disabled';--> statement-breakpoint
CREATE INDEX "payout_methods_msisdn_hash_index" ON "payout_methods" USING btree ("msisdn_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_one_open_per_creator" ON "payouts" USING btree ("creator_id") WHERE "payouts"."status" in ('requested', 'in_review', 'processing');--> statement-breakpoint
CREATE INDEX "payouts_status_requested_at_index" ON "payouts" USING btree ("status","requested_at");--> statement-breakpoint
CREATE INDEX "payouts_creator_id_requested_at_index" ON "payouts" USING btree ("creator_id","requested_at");