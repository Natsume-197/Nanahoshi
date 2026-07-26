UPDATE "enrichment_state"
SET "next_retry_at" = NULL,
	"retry_cancelled_at" = coalesce("retry_cancelled_at", now()),
	"retry_generation" = "retry_generation" + 1
WHERE "archived_at" IS NOT NULL
	AND "next_retry_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "enrichment_state" ADD CONSTRAINT "enrichment_state_archived_retry_check" CHECK ("enrichment_state"."archived_at" IS NULL OR "enrichment_state"."next_retry_at" IS NULL);
