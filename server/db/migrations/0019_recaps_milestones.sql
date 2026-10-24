CREATE TABLE "creator_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"key" text NOT NULL,
	"achieved_at" timestamp with time zone NOT NULL,
	"payment_id" uuid,
	"silent" boolean DEFAULT false NOT NULL,
	"emailed_at" timestamp with time zone,
	"seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_recaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"month" text NOT NULL,
	"stats" jsonb NOT NULL,
	"emailed_at" timestamp with time zone,
	"seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN "recap_emails" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN "milestone_emails" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "creator_milestones" ADD CONSTRAINT "creator_milestones_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_milestones" ADD CONSTRAINT "creator_milestones_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_recaps" ADD CONSTRAINT "creator_recaps_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "creator_milestones_creator_id_key_index" ON "creator_milestones" USING btree ("creator_id","key");--> statement-breakpoint
CREATE INDEX "creator_milestones_emailed_at_silent_index" ON "creator_milestones" USING btree ("emailed_at","silent");--> statement-breakpoint
CREATE UNIQUE INDEX "creator_recaps_creator_id_month_index" ON "creator_recaps" USING btree ("creator_id","month");--> statement-breakpoint
CREATE INDEX "creator_recaps_month_emailed_at_index" ON "creator_recaps" USING btree ("month","emailed_at");--> statement-breakpoint
CREATE INDEX "payments_creator_id_status_settled_at_index" ON "payments" USING btree ("creator_id","status","settled_at");