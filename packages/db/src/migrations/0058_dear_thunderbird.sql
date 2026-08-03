ALTER TABLE "series" ADD COLUMN "aliases" text[] DEFAULT '{}'::text[] NOT NULL;
--> statement-breakpoint
CREATE INDEX "pgroonga_series_aliases" ON "series" USING pgroonga ("aliases");
