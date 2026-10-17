CREATE TYPE "public"."webhook_event_status" AS ENUM('processing', 'processed', 'ignored', 'failed', 'dead');--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_name" text NOT NULL,
	"object_type" text,
	"object_id" text,
	"status" "webhook_event_status" DEFAULT 'processing' NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"last_error" text,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_provider_event_id_index" ON "webhook_events" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "webhook_events_status_received_at_index" ON "webhook_events" USING btree ("status","received_at");--> statement-breakpoint
CREATE INDEX "webhook_events_object_id_index" ON "webhook_events" USING btree ("object_id");