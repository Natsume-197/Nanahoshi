ALTER TABLE "audiobook_metadata" ADD COLUMN "enriched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "audiobook_metadata" ADD COLUMN "enriched_by" varchar(32);--> statement-breakpoint
UPDATE "audiobook_metadata" SET "enriched_at" = now(), "enriched_by" = 'audible' WHERE "asin" IS NOT NULL;