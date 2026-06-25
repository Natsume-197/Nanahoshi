ALTER TABLE "audiobook_metadata" DROP CONSTRAINT "audiobook_metadata_series_id_fkey";
--> statement-breakpoint
ALTER TABLE "book_metadata" DROP CONSTRAINT "book_metadata_series_id_fkey";
--> statement-breakpoint
ALTER TABLE "audiobook_metadata" DROP COLUMN "series_id";--> statement-breakpoint
ALTER TABLE "book_metadata" DROP COLUMN "series_id";