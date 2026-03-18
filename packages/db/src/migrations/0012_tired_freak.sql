ALTER TABLE "book_genre" DROP CONSTRAINT "book_genre_book_id_fkey";
--> statement-breakpoint
ALTER TABLE "book_genre" ADD CONSTRAINT "book_genre_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."book_metadata"("book_id") ON DELETE cascade ON UPDATE cascade;