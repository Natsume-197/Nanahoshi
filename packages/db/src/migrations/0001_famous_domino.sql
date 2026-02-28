CREATE TYPE "public"."activity_type" AS ENUM('started_reading', 'completed_reading', 'liked_book');--> statement-breakpoint
CREATE TABLE "activity" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" "activity_type" NOT NULL,
	"book_id" bigint NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."book"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_user_created_idx" ON "activity" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_created_idx" ON "activity" USING btree ("created_at");--> statement-breakpoint
INSERT INTO "activity" ("user_id", "type", "book_id", "created_at")
SELECT rp."user_id", 'started_reading'::"activity_type", rp."book_id", rp."started_at"
FROM "reading_progress" rp
WHERE rp."status" IN ('reading', 'completed') AND rp."started_at" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "activity" ("user_id", "type", "book_id", "created_at")
SELECT rp."user_id", 'completed_reading'::"activity_type", rp."book_id", rp."completed_at"
FROM "reading_progress" rp
WHERE rp."status" = 'completed' AND rp."completed_at" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "activity" ("user_id", "type", "book_id", "created_at")
SELECT lb."user_id", 'liked_book'::"activity_type", lb."book_id", lb."created_at"
FROM "liked_book" lb
ON CONFLICT DO NOTHING;