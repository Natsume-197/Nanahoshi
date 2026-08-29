UPDATE "enrichment_state"
SET "status" = 'enriched', "next_retry_at" = NULL, "retry_cancelled_at" = NULL
WHERE "archived_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "enrichment_state" DROP CONSTRAINT "enrichment_state_archived_retry_check";--> statement-breakpoint
DROP INDEX "enrichment_state_status_idx";--> statement-breakpoint
CREATE INDEX "enrichment_state_status_idx" ON "enrichment_state" USING btree ("status");--> statement-breakpoint
ALTER TABLE "enrichment_state" DROP COLUMN "archived_at";
