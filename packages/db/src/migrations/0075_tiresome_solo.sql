CREATE TABLE "scanned_directory" (
	"id" serial PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"library_path_id" bigint NOT NULL,
	"mtime_ms" bigint NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scanned_directory" ADD CONSTRAINT "scanned_directory_library_path_id_fkey" FOREIGN KEY ("library_path_id") REFERENCES "public"."library_path"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "scanned_directory_path_library_path_idx" ON "scanned_directory" USING btree ("path","library_path_id");