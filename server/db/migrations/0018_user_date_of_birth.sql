ALTER TABLE "users" ADD COLUMN "date_of_birth_enc" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "date_of_birth_required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Accounts that existed before sign-up asked for a date of birth are not prompted for one.
UPDATE "users" SET "date_of_birth_required" = false;
