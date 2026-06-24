ALTER TABLE "book" ADD COLUMN "duplicate_of_book_id" bigint;--> statement-breakpoint
ALTER TABLE "book" ADD COLUMN "group_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "book" ADD CONSTRAINT "book_duplicate_of_fkey" FOREIGN KEY ("duplicate_of_book_id") REFERENCES "public"."book"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "book_duplicate_of_idx" ON "book" USING btree ("duplicate_of_book_id");