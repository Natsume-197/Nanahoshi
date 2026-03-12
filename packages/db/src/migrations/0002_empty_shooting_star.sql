CREATE TYPE "public"."shelf_status" AS ENUM('want_to_read', 'backlog', 'reading', 'completed');--> statement-breakpoint
CREATE TABLE "user_book_shelf" (
	"user_id" text NOT NULL,
	"book_id" bigint NOT NULL,
	"status" "shelf_status" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_book_shelf_pkey" PRIMARY KEY("user_id","book_id")
);
--> statement-breakpoint
ALTER TABLE "user_book_shelf" ADD CONSTRAINT "user_book_shelf_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_book_shelf" ADD CONSTRAINT "user_book_shelf_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."book"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_book_shelf_user_idx" ON "user_book_shelf" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_book_shelf_status_idx" ON "user_book_shelf" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "reading_progress_user_idx" ON "reading_progress" USING btree ("user_id");