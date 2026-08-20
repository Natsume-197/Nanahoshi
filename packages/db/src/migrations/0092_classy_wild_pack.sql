CREATE TABLE "download_delivery_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivery_kind" text NOT NULL,
	"source" text NOT NULL,
	"user_id" text NOT NULL,
	"user_name" text,
	"session_id" text,
	"server_id" text NOT NULL,
	"server_name" text,
	"item_uuid" text NOT NULL,
	"item_title" text NOT NULL,
	"filename" text NOT NULL,
	"file_count" integer DEFAULT 1 NOT NULL,
	"device" text,
	"ip_address" text
);
--> statement-breakpoint
CREATE INDEX "download_delivery_event_created_at_idx" ON "download_delivery_event" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "download_delivery_event_user_created_at_idx" ON "download_delivery_event" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "download_delivery_event_server_created_at_idx" ON "download_delivery_event" USING btree ("server_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "download_delivery_event_item_created_at_idx" ON "download_delivery_event" USING btree ("item_uuid","created_at" DESC NULLS LAST);