CREATE TYPE "public"."creator_profile_status" AS ENUM('draft', 'published', 'unpublished', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."creator_risk_tier" AS ENUM('low', 'medium', 'high', 'restricted');--> statement-breakpoint
CREATE TYPE "public"."social_platform" AS ENUM('website', 'instagram', 'tiktok', 'youtube', 'facebook', 'x', 'linkedin', 'spotify', 'soundcloud');--> statement-breakpoint
CREATE TYPE "public"."creator_verification_tier" AS ENUM('none', 'email', 'id_verified');--> statement-breakpoint
CREATE TYPE "public"."creator_wallet_status" AS ENUM('pending', 'active', 'failed', 'frozen');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "creator_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"handle" text NOT NULL,
	"handle_lower" text NOT NULL,
	"handle_changed_at" timestamp with time zone,
	"display_name" text NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"avatar_key" text,
	"category_id" uuid,
	"suggested_amounts_minor" integer[] DEFAULT '{2000,5000,10000}'::integer[] NOT NULL,
	"support_message_enabled" boolean DEFAULT true NOT NULL,
	"status" "creator_profile_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"creator_terms_accepted_at" timestamp with time zone,
	"verification_tier" "creator_verification_tier" DEFAULT 'none' NOT NULL,
	"risk_tier" "creator_risk_tier" DEFAULT 'low' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_profiles_userId_unique" UNIQUE("user_id"),
	CONSTRAINT "creator_profiles_handleLower_unique" UNIQUE("handle_lower"),
	CONSTRAINT "creator_profiles_handle_lower" CHECK ("creator_profiles"."handle_lower" = lower("creator_profiles"."handle")),
	CONSTRAINT "creator_profiles_bio_length" CHECK (char_length("creator_profiles"."bio") <= 500)
);
--> statement-breakpoint
CREATE TABLE "creator_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"monime_financial_account_id" text,
	"uvan" text,
	"currency" text DEFAULT 'SLE' NOT NULL,
	"status" "creator_wallet_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"last_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_wallets_userId_unique" UNIQUE("user_id"),
	CONSTRAINT "creator_wallets_monimeFinancialAccountId_unique" UNIQUE("monime_financial_account_id")
);
--> statement-breakpoint
CREATE TABLE "handle_history" (
	"handle_lower" text PRIMARY KEY NOT NULL,
	"profile_id" uuid NOT NULL,
	"released_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reserved_handles" (
	"handle" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"platform" "social_platform" NOT NULL,
	"url" text NOT NULL,
	"verified_at" timestamp with time zone,
	"position" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "social_links_https" CHECK ("social_links"."url" like 'https://%')
);
--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_wallets" ADD CONSTRAINT "creator_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handle_history" ADD CONSTRAINT "handle_history_profile_id_creator_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_links" ADD CONSTRAINT "social_links_profile_id_creator_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creator_wallets_status_index" ON "creator_wallets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "handle_history_profile_id_index" ON "handle_history" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "social_links_profile_id_index" ON "social_links" USING btree ("profile_id");