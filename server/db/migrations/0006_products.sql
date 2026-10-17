CREATE TYPE "public"."product_asset_kind" AS ENUM('file', 'preview_image');--> statement-breakpoint
CREATE TYPE "public"."license_type" AS ENUM('personal', 'personal_modify', 'commercial');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'pending_review', 'published', 'unpublished', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."scan_status" AS ENUM('uploading', 'pending', 'clean', 'rejected');--> statement-breakpoint
CREATE TABLE "download_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entitlement_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"downloads_used" integer DEFAULT 0 NOT NULL,
	"download_limit" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entitlements_orderId_unique" UNIQUE("order_id"),
	CONSTRAINT "entitlements_downloads_within_limit" CHECK ("entitlements"."downloads_used" <= "entitlements"."download_limit")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"buyer_email_enc" text NOT NULL,
	"buyer_email_hash" text NOT NULL,
	"buyer_name" text,
	"price_minor" bigint NOT NULL,
	"access_token_hash" text NOT NULL,
	"access_token_enc" text NOT NULL,
	"claim_hash" text,
	"receipt_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_paymentId_unique" UNIQUE("payment_id"),
	CONSTRAINT "orders_accessTokenHash_unique" UNIQUE("access_token_hash")
);
--> statement-breakpoint
CREATE TABLE "product_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"kind" "product_asset_kind" NOT NULL,
	"r2_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text,
	"scan_status" "scan_status" DEFAULT 'uploading' NOT NULL,
	"scan_detail" text,
	"watermarkable" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_assets_r2Key_unique" UNIQUE("r2_key")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category_id" uuid,
	"price_minor" bigint NOT NULL,
	"currency" text DEFAULT 'SLE' NOT NULL,
	"license_type" "license_type" DEFAULT 'personal' NOT NULL,
	"license_text" text DEFAULT '' NOT NULL,
	"download_limit" integer NOT NULL,
	"access_days" integer NOT NULL,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"review_note" text,
	"ownership_declared_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_price_positive" CHECK ("products"."price_minor" > 0),
	CONSTRAINT "products_title_length" CHECK (char_length("products"."title") between 1 and 120),
	CONSTRAINT "products_description_length" CHECK (char_length("products"."description") <= 5000)
);
--> statement-breakpoint
ALTER TABLE "download_events" ADD CONSTRAINT "download_events_entitlement_id_entitlements_id_fk" FOREIGN KEY ("entitlement_id") REFERENCES "public"."entitlements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "download_events" ADD CONSTRAINT "download_events_asset_id_product_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."product_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_assets" ADD CONSTRAINT "product_assets_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "download_events_entitlement_id_created_at_index" ON "download_events" USING btree ("entitlement_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_buyer_email_hash_index" ON "orders" USING btree ("buyer_email_hash");--> statement-breakpoint
CREATE INDEX "orders_creator_id_created_at_index" ON "orders" USING btree ("creator_id","created_at");--> statement-breakpoint
CREATE INDEX "product_assets_product_id_kind_index" ON "product_assets" USING btree ("product_id","kind");--> statement-breakpoint
CREATE INDEX "products_creator_id_status_index" ON "products" USING btree ("creator_id","status");--> statement-breakpoint
CREATE INDEX "products_status_updated_at_index" ON "products" USING btree ("status","updated_at");