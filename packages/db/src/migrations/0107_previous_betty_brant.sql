CREATE TYPE "public"."collection_kind" AS ENUM('manual', 'dynamic');--> statement-breakpoint
ALTER TABLE "collection" ADD COLUMN "kind" "collection_kind" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "collection" ADD COLUMN "dynamic_definition" jsonb;--> statement-breakpoint
CREATE INDEX "collection_user_server_kind_updated_idx" ON "collection" USING btree ("user_id","server_id","kind","updated_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_kind_definition_check" CHECK (("collection"."kind" = 'manual' AND "collection"."dynamic_definition" IS NULL) OR ("collection"."kind" = 'dynamic' AND "collection"."dynamic_definition" IS NOT NULL));