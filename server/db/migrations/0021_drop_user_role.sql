-- Staff now live in admins (0020). A staff user who also owns creator data can't be removed
-- safely: stop and sort that account out by hand rather than guess.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "users" u WHERE u."role" IN ('staff', 'super_admin')
      AND (EXISTS (SELECT 1 FROM "creator_profiles" p WHERE p."user_id" = u."id")
        OR EXISTS (SELECT 1 FROM "kyc_submissions" k WHERE k."user_id" = u."id")
        OR EXISTS (SELECT 1 FROM "payments" pay WHERE pay."creator_id" = u."id"))
  ) THEN
    RAISE EXCEPTION 'A staff account also has creator data. Move it to a separate creator account before migrating.';
  END IF;
END $$;--> statement-breakpoint
DELETE FROM "users" WHERE "role" IN ('staff', 'super_admin');--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "role";--> statement-breakpoint
DROP TYPE "public"."user_role";
