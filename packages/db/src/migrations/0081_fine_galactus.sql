CREATE TYPE "public"."read_listen_generation_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "read_listen_generation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pair_id" uuid NOT NULL,
	"task_id" text NOT NULL,
	"status" "read_listen_generation_status" DEFAULT 'queued' NOT NULL,
	"provider" varchar(32) NOT NULL,
	"quality" varchar(32) NOT NULL,
	"requested_by_user_id" text,
	"ebook_catalog_hash" text NOT NULL,
	"audiobook_catalog_hash" text NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "read_listen_generation_task_id_unique" UNIQUE("task_id")
);
--> statement-breakpoint
ALTER TABLE "read_listen_generation" ADD CONSTRAINT "read_listen_generation_pair_id_read_listen_pair_id_fk" FOREIGN KEY ("pair_id") REFERENCES "public"."read_listen_pair"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read_listen_generation" ADD CONSTRAINT "read_listen_generation_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "read_listen_generation_pair_idx" ON "read_listen_generation" USING btree ("pair_id");--> statement-breakpoint
CREATE INDEX "read_listen_generation_status_idx" ON "read_listen_generation" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "read_listen_generation_active_pair_idx" ON "read_listen_generation" USING btree ("pair_id") WHERE "read_listen_generation"."status" in ('queued', 'running');