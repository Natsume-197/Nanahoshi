CREATE TABLE "read_listen_match_evaluation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" text NOT NULL,
	"audiobook_book_id" bigint NOT NULL,
	"matcher_version" varchar(32) NOT NULL,
	"candidate_count" integer NOT NULL,
	"proposal_count" integer NOT NULL,
	"max_score" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "read_listen_match_evaluation_counts_check" CHECK ("read_listen_match_evaluation"."candidate_count" >= 0 and "read_listen_match_evaluation"."proposal_count" >= 0 and "read_listen_match_evaluation"."proposal_count" <= "read_listen_match_evaluation"."candidate_count"),
	CONSTRAINT "read_listen_match_evaluation_score_check" CHECK ("read_listen_match_evaluation"."max_score" is null or "read_listen_match_evaluation"."max_score" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "read_listen_match_decision" DROP CONSTRAINT "read_listen_match_decision_selected_ebook_book_id_book_id_fk";
--> statement-breakpoint
ALTER TABLE "read_listen_match_evaluation" ADD CONSTRAINT "read_listen_match_evaluation_server_id_organization_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read_listen_match_evaluation" ADD CONSTRAINT "read_listen_match_evaluation_audiobook_book_id_book_id_fk" FOREIGN KEY ("audiobook_book_id") REFERENCES "public"."book"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "read_listen_match_evaluation_identity_idx" ON "read_listen_match_evaluation" USING btree ("server_id","audiobook_book_id","matcher_version");--> statement-breakpoint
CREATE INDEX "read_listen_match_evaluation_server_idx" ON "read_listen_match_evaluation" USING btree ("server_id");