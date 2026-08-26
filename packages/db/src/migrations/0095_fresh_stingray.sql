CREATE TYPE "public"."read_listen_match_confidence" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."read_listen_match_decision_action" AS ENUM('approve', 'reject', 'correct');--> statement-breakpoint
CREATE TYPE "public"."read_listen_match_proposal_status" AS ENUM('pending', 'decided', 'superseded');--> statement-breakpoint
CREATE TABLE "read_listen_match_decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"action" "read_listen_match_decision_action" NOT NULL,
	"selected_ebook_book_id" bigint,
	"decided_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "read_listen_match_decision_selection_check" CHECK (("read_listen_match_decision"."action" = 'reject' and "read_listen_match_decision"."selected_ebook_book_id" is null) or ("read_listen_match_decision"."action" in ('approve', 'correct') and "read_listen_match_decision"."selected_ebook_book_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "read_listen_match_proposal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" text NOT NULL,
	"audiobook_book_id" bigint NOT NULL,
	"ebook_book_id" bigint NOT NULL,
	"score" integer NOT NULL,
	"confidence" "read_listen_match_confidence" NOT NULL,
	"reasons" jsonb NOT NULL,
	"warnings" jsonb NOT NULL,
	"matcher_version" varchar(32) NOT NULL,
	"status" "read_listen_match_proposal_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "read_listen_match_proposal_score_check" CHECK ("read_listen_match_proposal"."score" between 0 and 100),
	CONSTRAINT "read_listen_match_proposal_distinct_sources_check" CHECK ("read_listen_match_proposal"."ebook_book_id" <> "read_listen_match_proposal"."audiobook_book_id")
);
--> statement-breakpoint
ALTER TABLE "read_listen_match_decision" ADD CONSTRAINT "read_listen_match_decision_proposal_id_read_listen_match_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."read_listen_match_proposal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read_listen_match_decision" ADD CONSTRAINT "read_listen_match_decision_selected_ebook_book_id_book_id_fk" FOREIGN KEY ("selected_ebook_book_id") REFERENCES "public"."book"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read_listen_match_decision" ADD CONSTRAINT "read_listen_match_decision_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read_listen_match_proposal" ADD CONSTRAINT "read_listen_match_proposal_server_id_organization_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read_listen_match_proposal" ADD CONSTRAINT "read_listen_match_proposal_audiobook_book_id_book_id_fk" FOREIGN KEY ("audiobook_book_id") REFERENCES "public"."book"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read_listen_match_proposal" ADD CONSTRAINT "read_listen_match_proposal_ebook_book_id_book_id_fk" FOREIGN KEY ("ebook_book_id") REFERENCES "public"."book"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "read_listen_match_decision_proposal_idx" ON "read_listen_match_decision" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "read_listen_match_decision_user_idx" ON "read_listen_match_decision" USING btree ("decided_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "read_listen_match_proposal_identity_idx" ON "read_listen_match_proposal" USING btree ("server_id","audiobook_book_id","ebook_book_id","matcher_version");--> statement-breakpoint
CREATE INDEX "read_listen_match_proposal_review_idx" ON "read_listen_match_proposal" USING btree ("server_id","status","score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "read_listen_match_proposal_audiobook_idx" ON "read_listen_match_proposal" USING btree ("audiobook_book_id");