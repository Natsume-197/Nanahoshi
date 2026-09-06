CREATE TABLE "reading_run" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"book_id" bigint NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"state" text DEFAULT 'reading' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reading_segment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"seconds" double precision NOT NULL,
	"start_position" double precision,
	"end_position" double precision,
	"kind" text NOT NULL,
	CONSTRAINT "reading_segment_duration_check" CHECK ("reading_segment"."seconds" >= 0 AND "reading_segment"."ended_at" >= "reading_segment"."started_at")
);
--> statement-breakpoint
CREATE TABLE "reading_session" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"state" text DEFAULT 'active' NOT NULL,
	"mode" text NOT NULL,
	"source" text NOT NULL,
	"device" text NOT NULL,
	"installation_id" uuid NOT NULL,
	"content_version" text NOT NULL,
	"time_zone" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"discarded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reading_tracking_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'automatic' NOT NULL,
	"idle_minutes" integer DEFAULT 5 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reading_run" ADD CONSTRAINT "reading_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_run" ADD CONSTRAINT "reading_run_book_id_book_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."book"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_segment" ADD CONSTRAINT "reading_segment_session_id_reading_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."reading_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_session" ADD CONSTRAINT "reading_session_run_id_reading_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."reading_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_tracking_preference" ADD CONSTRAINT "reading_tracking_preference_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reading_run_owner_book_idx" ON "reading_run" USING btree ("user_id","book_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reading_run_current_idx" ON "reading_run" USING btree ("user_id","book_id") WHERE "reading_run"."state" = 'reading';--> statement-breakpoint
CREATE INDEX "reading_segment_session_idx" ON "reading_segment" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "reading_session_run_idx" ON "reading_session" USING btree ("run_id","started_at");