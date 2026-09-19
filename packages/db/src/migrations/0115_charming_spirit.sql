CREATE TABLE "enrichment_run_diagnostic" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"book_id" bigint NOT NULL,
	"outcome" text NOT NULL,
	"diagnostics" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "book_metadata" ADD COLUMN "provider_ratings" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "enrichment_run_diagnostic" ADD CONSTRAINT "enrichment_run_diagnostic_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."book"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "enrichment_run_diagnostic_book_created_idx" ON "enrichment_run_diagnostic" USING btree ("book_id","created_at");