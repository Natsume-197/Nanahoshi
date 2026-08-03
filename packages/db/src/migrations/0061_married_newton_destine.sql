DELETE FROM "notification" WHERE "type" IN ('follow', 'follow_back', 'activity_like', 'activity_comment');--> statement-breakpoint
DROP TABLE "activity" CASCADE;--> statement-breakpoint
DROP TABLE "activity_comment" CASCADE;--> statement-breakpoint
DROP TABLE "activity_like" CASCADE;--> statement-breakpoint
DROP TABLE "user_follow" CASCADE;--> statement-breakpoint
DROP TYPE "public"."activity_type";
