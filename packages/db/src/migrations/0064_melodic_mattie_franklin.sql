ALTER TABLE "audiobook_metadata" DROP COLUMN "enriched_at";--> statement-breakpoint
ALTER TABLE "audiobook_metadata" DROP COLUMN "enriched_by";--> statement-breakpoint
ALTER TABLE "audiobook_metadata" DROP COLUMN "enrich_attempts";--> statement-breakpoint
ALTER TABLE "book_metadata" DROP COLUMN "amazon_rating";--> statement-breakpoint
ALTER TABLE "book_metadata" DROP COLUMN "amazon_review_count";--> statement-breakpoint
ALTER TABLE "book_metadata" DROP COLUMN "amazon_enriched_at";