ALTER TABLE "enrichment_state" DROP CONSTRAINT "enrichment_state_cancelled_retry_check";--> statement-breakpoint
ALTER TABLE "enrichment_state" DROP COLUMN "retry_cancelled_at";