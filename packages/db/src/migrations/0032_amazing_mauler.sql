ALTER TABLE "user" ADD COLUMN "presence_invisible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "user_follow_follower_idx" ON "user_follow" USING btree ("follower_id");