ALTER TABLE "work_popularity" ADD COLUMN "rating" double precision;--> statement-breakpoint
ALTER TABLE "work_popularity" ADD COLUMN "rating_count" integer;--> statement-breakpoint
UPDATE "work_popularity" SET "rating" = "amazon_rating", "rating_count" = "amazon_review_count" WHERE "amazon_rating" IS NOT NULL OR "amazon_review_count" IS NOT NULL;