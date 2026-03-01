ALTER TABLE "todo" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "todo" CASCADE;--> statement-breakpoint
ALTER TABLE "book" DROP CONSTRAINT "book_filehash_unique";--> statement-breakpoint
ALTER TABLE "scanned_file" DROP CONSTRAINT "scanned_file_path_unique";--> statement-breakpoint
ALTER TABLE "scanned_file" ADD COLUMN "library_path_id" bigint NOT NULL;--> statement-breakpoint
ALTER TABLE "scanned_file" ADD CONSTRAINT "scanned_file_library_path_id_fkey" FOREIGN KEY ("library_path_id") REFERENCES "public"."library_path"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "scanned_file_path_library_path_idx" ON "scanned_file" USING btree ("path","library_path_id");