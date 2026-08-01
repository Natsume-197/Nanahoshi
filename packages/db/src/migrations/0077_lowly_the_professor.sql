CREATE TABLE "scan_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" text NOT NULL,
	"library_path_id" bigint NOT NULL,
	"mode" varchar(20) NOT NULL,
	"phase" varchar(20) DEFAULT 'discovery' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"discovered_count" bigint DEFAULT 0 NOT NULL,
	"statted_count" bigint DEFAULT 0 NOT NULL,
	"hashed_count" bigint DEFAULT 0 NOT NULL,
	"persisted_count" bigint DEFAULT 0 NOT NULL,
	"error_count" bigint DEFAULT 0 NOT NULL,
	"failure" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scanned_directory" ADD COLUMN "completed_scan_run_id" uuid;--> statement-breakpoint
ALTER TABLE "scanned_file" ADD COLUMN "last_seen_scan_run_id" uuid;--> statement-breakpoint
ALTER TABLE "scan_run" ADD CONSTRAINT "scan_run_library_path_id_fkey" FOREIGN KEY ("library_path_id") REFERENCES "public"."library_path"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "scan_run_task_path_idx" ON "scan_run" USING btree ("task_id","library_path_id");--> statement-breakpoint
CREATE INDEX "scan_run_path_status_idx" ON "scan_run" USING btree ("library_path_id","status");--> statement-breakpoint
ALTER TABLE "scanned_directory" ADD CONSTRAINT "scanned_directory_completed_scan_run_id_fkey" FOREIGN KEY ("completed_scan_run_id") REFERENCES "public"."scan_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scanned_file" ADD CONSTRAINT "scanned_file_last_seen_scan_run_id_fkey" FOREIGN KEY ("last_seen_scan_run_id") REFERENCES "public"."scan_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scanned_directory_scan_run_idx" ON "scanned_directory" USING btree ("completed_scan_run_id");--> statement-breakpoint
CREATE INDEX "scanned_file_scan_run_idx" ON "scanned_file" USING btree ("last_seen_scan_run_id");