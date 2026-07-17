CREATE INDEX "audiobook_author_author_id_idx" ON "audiobook_author" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "audiobook_genre_genre_id_idx" ON "audiobook_genre" USING btree ("genre_id");--> statement-breakpoint
CREATE INDEX "audiobook_tag_tag_id_idx" ON "audiobook_tag" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "book_author_author_id_idx" ON "book_author" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "book_genre_genre_id_idx" ON "book_genre" USING btree ("genre_id");--> statement-breakpoint
CREATE INDEX "book_metadata_publisher_id_idx" ON "book_metadata" USING btree ("publisher_id");--> statement-breakpoint
CREATE INDEX "book_metadata_title_idx" ON "book_metadata" USING btree ("title");--> statement-breakpoint
CREATE INDEX "book_narrator_narrator_id_idx" ON "book_narrator" USING btree ("narrator_id");--> statement-breakpoint
CREATE INDEX "book_tag_tag_id_idx" ON "book_tag" USING btree ("tag_id");