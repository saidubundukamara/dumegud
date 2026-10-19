CREATE TABLE "account_deletions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"erase_after" timestamp with time zone NOT NULL,
	"canceled_at" timestamp with time zone,
	"erased_at" timestamp with time zone,
	"forfeited_minor" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_deletions" ADD CONSTRAINT "account_deletions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_deletions_one_open_per_user" ON "account_deletions" USING btree ("user_id") WHERE "account_deletions"."canceled_at" is null and "account_deletions"."erased_at" is null;--> statement-breakpoint
CREATE INDEX "account_deletions_erase_after_index" ON "account_deletions" USING btree ("erase_after");