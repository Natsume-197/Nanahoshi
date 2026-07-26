ALTER TABLE "enrichment_state" ADD COLUMN "retry_cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "enrichment_state" ADD COLUMN "retry_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "enrichment_state"
SET "next_retry_at" = NULL
WHERE "next_retry_at" IS NOT NULL
	AND "status" NOT IN ('pending', 'partial');--> statement-breakpoint
ALTER TABLE "enrichment_state" ADD CONSTRAINT "enrichment_state_retryable_status_check" CHECK ("enrichment_state"."next_retry_at" IS NULL OR "enrichment_state"."status" IN ('pending', 'partial'));--> statement-breakpoint
ALTER TABLE "enrichment_state" ADD CONSTRAINT "enrichment_state_cancelled_retry_check" CHECK ("enrichment_state"."retry_cancelled_at" IS NULL OR "enrichment_state"."next_retry_at" IS NULL);
