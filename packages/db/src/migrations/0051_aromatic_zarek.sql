CREATE INDEX "audiobook_series_book_id_idx" ON "audiobook_series" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "book_series_book_id_idx" ON "book_series" USING btree ("book_id");