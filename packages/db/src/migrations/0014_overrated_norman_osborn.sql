ALTER TABLE "book_series" DROP CONSTRAINT "book_series_book_id_fkey";
--> statement-breakpoint
ALTER TABLE "book_series" ADD CONSTRAINT "book_series_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."book_metadata"("book_id") ON DELETE cascade ON UPDATE cascade;