CREATE TABLE "reading_progress_sync_operation" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"book_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reading_progress" ADD COLUMN IF NOT EXISTS "position_intent_at" bigint;--> statement-breakpoint
ALTER TABLE "reading_progress" ADD COLUMN IF NOT EXISTS "position_operation_id" varchar(36);--> statement-breakpoint
ALTER TABLE "reading_progress" ADD COLUMN IF NOT EXISTS "position_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reading_progress_sync_operation" ADD CONSTRAINT "reading_progress_sync_operation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_progress_sync_operation" ADD CONSTRAINT "reading_progress_sync_operation_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."book"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reading_progress_sync_operation_created_at_idx" ON "reading_progress_sync_operation" USING btree ("created_at");
