CREATE TABLE "enrichment_state" (
	"book_id" bigint PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_run_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"matched" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"failures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_retry_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "audiobook_metadata" ADD COLUMN "field_sources" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "book_metadata" ADD COLUMN "rating" double precision;--> statement-breakpoint
ALTER TABLE "book_metadata" ADD COLUMN "rating_count" integer;--> statement-breakpoint
ALTER TABLE "book_metadata" ADD COLUMN "field_sources" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "enrichment_state" ADD CONSTRAINT "enrichment_state_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."book"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "enrichment_state_status_idx" ON "enrichment_state" USING btree ("status");--> statement-breakpoint
UPDATE "book_metadata" SET "rating" = "amazon_rating", "rating_count" = "amazon_review_count" WHERE "amazon_rating" IS NOT NULL OR "amazon_review_count" IS NOT NULL;--> statement-breakpoint
INSERT INTO "enrichment_state" ("book_id", "status", "last_run_at")
SELECT bm."book_id", 'enriched', bm."amazon_enriched_at"
FROM "book_metadata" bm
JOIN "book" b ON b."id" = bm."book_id"
WHERE bm."amazon_enriched_at" IS NOT NULL
ON CONFLICT ("book_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "enrichment_state" ("book_id", "status", "last_run_at", "attempts", "matched")
SELECT am."book_id",
	CASE WHEN am."enriched_by" IS NOT NULL THEN 'enriched' ELSE 'no_match' END,
	am."enriched_at",
	am."enrich_attempts",
	CASE WHEN am."enriched_by" IS NOT NULL
		THEN jsonb_build_array(jsonb_build_object('provider', am."enriched_by", 'providerId', NULL))
		ELSE '[]'::jsonb END
FROM "audiobook_metadata" am
JOIN "book" b ON b."id" = am."book_id"
WHERE am."enriched_at" IS NOT NULL
ON CONFLICT ("book_id") DO NOTHING;