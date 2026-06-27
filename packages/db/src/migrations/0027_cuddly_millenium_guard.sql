ALTER TABLE "library_path" ALTER COLUMN "is_enabled" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "library" ADD COLUMN "scan_interval_minutes" integer;