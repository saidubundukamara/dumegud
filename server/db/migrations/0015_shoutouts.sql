CREATE TYPE "public"."traffic_source" AS ENUM('tiktok', 'instagram', 'facebook', 'whatsapp', 'x', 'youtube', 'direct', 'other');--> statement-breakpoint
CREATE TABLE "shoutouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"period" text NOT NULL,
	"platform" "social_platform" NOT NULL,
	"include_top" boolean DEFAULT false NOT NULL,
	"contribution_ids" uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN "social_platform" "social_platform";--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN "social_handle" text;--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN "shoutout_consent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN "shoutout_consent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN "claim_hash" text;--> statement-breakpoint
ALTER TABLE "contributions" ADD COLUMN "thanked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "traffic_source" "traffic_source";--> statement-breakpoint
ALTER TABLE "shoutouts" ADD CONSTRAINT "shoutouts_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shoutouts_creator_id_created_at_index" ON "shoutouts" USING btree ("creator_id","created_at");--> statement-breakpoint
CREATE INDEX "contributions_creator_id_thanked_at_index" ON "contributions" USING btree ("creator_id","thanked_at");--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_handle_pair" CHECK (("contributions"."social_handle" is null) = ("contributions"."social_platform" is null));--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_anonymous_no_shoutout" CHECK (not ("contributions"."is_anonymous" and "contributions"."shoutout_consent"));