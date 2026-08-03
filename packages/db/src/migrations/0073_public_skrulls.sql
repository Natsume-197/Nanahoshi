ALTER TABLE "library" ADD COLUMN "last_scanned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "library_path" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "library_path" ADD COLUMN "last_checked_at" timestamp with time zone;