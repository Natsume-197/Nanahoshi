CREATE TABLE "book_metadata_original" (
	"book_id" bigint PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "book_metadata_original" ADD CONSTRAINT "book_metadata_original_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."book"("id") ON DELETE cascade ON UPDATE cascade;