ALTER TABLE "reading_run" DROP CONSTRAINT "reading_run_book_id_book_id_fk";
--> statement-breakpoint
ALTER TABLE "reading_run" ALTER COLUMN "book_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reading_run" ADD COLUMN "orphan_hash" text;--> statement-breakpoint
ALTER TABLE "reading_run" ADD COLUMN "orphan_server_id" text;--> statement-breakpoint
ALTER TABLE "reading_run" ADD CONSTRAINT "reading_run_orphan_server_id_organization_id_fk" FOREIGN KEY ("orphan_server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_run" ADD CONSTRAINT "reading_run_book_id_book_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."book"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reading_run_orphan_idx" ON "reading_run" USING btree ("orphan_server_id","orphan_hash") WHERE "reading_run"."book_id" IS NULL;