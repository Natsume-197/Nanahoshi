ALTER TABLE "audiobook_metadata" DROP CONSTRAINT "audiobook_metadata_publisher_id_fkey";
--> statement-breakpoint
ALTER TABLE "audiobook_series" DROP CONSTRAINT "audiobook_series_series_id_fkey";
--> statement-breakpoint
ALTER TABLE "book_metadata" DROP CONSTRAINT "book_metadata_publisher_id_fkey";
--> statement-breakpoint
ALTER TABLE "book_series" DROP CONSTRAINT "book_series_series_id_fkey";
--> statement-breakpoint
ALTER TABLE "audiobook_metadata" ADD CONSTRAINT "audiobook_metadata_publisher_id_fkey" FOREIGN KEY ("publisher_id") REFERENCES "public"."publisher"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiobook_series" ADD CONSTRAINT "audiobook_series_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_metadata" ADD CONSTRAINT "book_metadata_publisher_id_fkey" FOREIGN KEY ("publisher_id") REFERENCES "public"."publisher"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_series" ADD CONSTRAINT "book_series_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;