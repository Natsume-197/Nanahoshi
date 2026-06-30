ALTER TABLE "user" ADD COLUMN "presence_status" text DEFAULT 'online' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "presence_invisible";