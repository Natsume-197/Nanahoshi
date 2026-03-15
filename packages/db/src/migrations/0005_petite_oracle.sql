CREATE INDEX "book_library_id_idx" ON "book" USING btree ("library_id");--> statement-breakpoint
CREATE INDEX "liked_book_user_org_idx" ON "liked_book" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE INDEX "reading_progress_user_status_idx" ON "reading_progress" USING btree ("user_id","status");