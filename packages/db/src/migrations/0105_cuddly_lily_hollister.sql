CREATE TABLE "audiobook_metadata_original" (
	"book_id" bigint PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audiobook_metadata_original" ADD CONSTRAINT "audiobook_metadata_original_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."book"("id") ON DELETE cascade ON UPDATE cascade;