ALTER TABLE "reading_tracking_preference" ADD COLUMN "daily_reading_goal_unit" text DEFAULT 'characters' NOT NULL;--> statement-breakpoint
ALTER TABLE "reading_tracking_preference" ADD COLUMN "daily_reading_goal" integer;--> statement-breakpoint
ALTER TABLE "reading_tracking_preference" ADD COLUMN "daily_listening_goal_minutes" integer;