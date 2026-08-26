CREATE TYPE "public"."read_listen_match_analysis_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "read_listen_match_analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" text NOT NULL,
	"server_id" text NOT NULL,
	"requested_by_user_id" text NOT NULL,
	"matcher_version" varchar(32) NOT NULL,
	"status" "read_listen_match_analysis_status" DEFAULT 'queued' NOT NULL,
	"candidate_count" integer DEFAULT 0 NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"proposal_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "read_listen_match_analysis_task_id_unique" UNIQUE("task_id"),
	CONSTRAINT "read_listen_match_analysis_counts_check" CHECK ("read_listen_match_analysis"."candidate_count" >= 0 and "read_listen_match_analysis"."completed_count" >= 0 and "read_listen_match_analysis"."skipped_count" >= 0 and "read_listen_match_analysis"."failed_count" >= 0 and "read_listen_match_analysis"."proposal_count" >= 0 and "read_listen_match_analysis"."completed_count" + "read_listen_match_analysis"."skipped_count" + "read_listen_match_analysis"."failed_count" <= "read_listen_match_analysis"."candidate_count")
);
--> statement-breakpoint
ALTER TABLE "read_listen_match_analysis" ADD CONSTRAINT "read_listen_match_analysis_server_id_organization_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read_listen_match_analysis" ADD CONSTRAINT "read_listen_match_analysis_requested_by_user_id_user_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "read_listen_match_analysis_server_idx" ON "read_listen_match_analysis" USING btree ("server_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "read_listen_match_analysis_active_idx" ON "read_listen_match_analysis" USING btree ("server_id","requested_by_user_id","matcher_version") WHERE "read_listen_match_analysis"."status" in ('queued', 'running');