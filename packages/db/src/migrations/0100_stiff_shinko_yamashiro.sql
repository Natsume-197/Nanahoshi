CREATE TYPE "public"."read_listen_match_analysis_job_outcome" AS ENUM('completed', 'skipped', 'failed');--> statement-breakpoint
CREATE TABLE "read_listen_match_analysis_outcome" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_id" uuid NOT NULL,
	"audiobook_uuid" uuid NOT NULL,
	"outcome" "read_listen_match_analysis_job_outcome" NOT NULL,
	"proposal_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "read_listen_match_analysis_outcome" ADD CONSTRAINT "read_listen_match_analysis_outcome_analysis_id_read_listen_match_analysis_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."read_listen_match_analysis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "read_listen_match_analysis_outcome_job_idx" ON "read_listen_match_analysis_outcome" USING btree ("analysis_id","audiobook_uuid");