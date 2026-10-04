ALTER TABLE "user" DROP COLUMN "bookmeter_user_id";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "bookmeter_last_synced_at";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "bookmeter_last_sync_result";--> statement-breakpoint
DELETE FROM "notification" WHERE "type" = 'task_finished' AND "payload"->>'taskType' = 'bookmeter-sync';