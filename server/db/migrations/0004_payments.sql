CREATE TYPE "public"."monime_fee_source" AS ENUM('reported', 'estimated');--> statement-breakpoint
CREATE TYPE "public"."message_visibility" AS ENUM('public', 'creator_only', 'hidden_by_moderation');--> statement-breakpoint
CREATE TYPE "public"."payment_event_source" AS ENUM('app', 'webhook', 'poll', 'cron', 'admin');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('contribution', 'order');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('created', 'pending', 'succeeded', 'failed', 'canceled', 'expired', 'reversed', 'under_review');--> statement-breakpoint
CREATE TYPE "public"."transfer_status" AS ENUM('none', 'pending', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"supporter_name" text,
	"message" text,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"message_visibility" "message_visibility" DEFAULT 'creator_only' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contributions_paymentId_unique" UNIQUE("payment_id")
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journal_id" uuid NOT NULL,
	"account" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_nonzero" CHECK ("ledger_entries"."amount_minor" <> 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_journals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"kind" text NOT NULL,
	"payment_id" uuid,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_journals_idempotencyKey_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"from_status" "payment_status",
	"to_status" "payment_status" NOT NULL,
	"source" "payment_event_source" NOT NULL,
	"provider_event_id" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "payment_kind" NOT NULL,
	"creator_id" uuid NOT NULL,
	"status" "payment_status" DEFAULT 'created' NOT NULL,
	"gross_minor" bigint NOT NULL,
	"currency" text DEFAULT 'SLE' NOT NULL,
	"monime_fee_minor" bigint,
	"monime_fee_source" "monime_fee_source",
	"late_reported_fee_minor" bigint,
	"arrived_minor" bigint,
	"platform_fee_bps" integer NOT NULL,
	"platform_fee_minor" bigint,
	"creator_net_minor" bigint,
	"monime_checkout_session_id" text,
	"checkout_url" text,
	"monime_payment_id" text,
	"financial_transaction_reference" text,
	"channel_reference" text,
	"channel_provider" text,
	"payer_fingerprint_hash" text,
	"ip_hash" text,
	"idempotency_key" text NOT NULL,
	"last_error" text,
	"settled_at" timestamp with time zone,
	"settlement_frozen" boolean DEFAULT false NOT NULL,
	"transfer_id" text,
	"transfer_status" "transfer_status" DEFAULT 'none' NOT NULL,
	"transfer_attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_monimeCheckoutSessionId_unique" UNIQUE("monime_checkout_session_id"),
	CONSTRAINT "payments_monimePaymentId_unique" UNIQUE("monime_payment_id"),
	CONSTRAINT "payments_idempotencyKey_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "payments_gross_positive" CHECK ("payments"."gross_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_journal_id_ledger_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."ledger_journals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_journals" ADD CONSTRAINT "ledger_journals_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_journal_id_account_index" ON "ledger_entries" USING btree ("journal_id","account");--> statement-breakpoint
CREATE INDEX "ledger_entries_account_created_at_index" ON "ledger_entries" USING btree ("account","created_at");--> statement-breakpoint
CREATE INDEX "payment_events_payment_id_created_at_index" ON "payment_events" USING btree ("payment_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_creator_id_status_created_at_index" ON "payments" USING btree ("creator_id","status","created_at");--> statement-breakpoint
CREATE INDEX "payments_status_created_at_index" ON "payments" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "payments_payer_fingerprint_hash_settled_at_index" ON "payments" USING btree ("payer_fingerprint_hash","settled_at");--> statement-breakpoint
CREATE INDEX "payments_ip_hash_created_at_index" ON "payments" USING btree ("ip_hash","created_at");