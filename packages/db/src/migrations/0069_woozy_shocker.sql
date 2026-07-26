DROP INDEX "enrichment_state_status_idx";--> statement-breakpoint
ALTER TABLE "enrichment_state" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "library" ADD COLUMN "auto_enrich_paused_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "enrichment_state_status_idx" ON "enrichment_state" USING btree ("status") WHERE "enrichment_state"."archived_at" IS NULL;