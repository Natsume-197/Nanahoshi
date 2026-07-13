CREATE INDEX IF NOT EXISTS "liked_book_book_idx" ON "liked_book" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "listening_progress_book_status_idx" ON "listening_progress" USING btree ("book_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reading_progress_book_status_idx" ON "reading_progress" USING btree ("book_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_audiobook_shelf_book_idx" ON "user_audiobook_shelf" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_book_shelf_book_idx" ON "user_book_shelf" USING btree ("book_id");
