CREATE TABLE "organization_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_settings_server_id_key_unique" UNIQUE("server_id","key")
);
--> statement-breakpoint
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_server_id_organization_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Backfill per-org metadata-source settings from the legacy global app_settings
-- rows so existing tenants keep their Amazon domain/cookie and RanobeDB toggle.
-- On a fresh install (no global rows) the CROSS JOIN is empty and nothing runs.
INSERT INTO "organization_settings" ("server_id", "key", "value")
SELECT o."id", 'amazon', s."value"
FROM "organization" o
CROSS JOIN (SELECT "value" FROM "app_settings" WHERE "key" = 'amazon' LIMIT 1) s
ON CONFLICT ("server_id", "key") DO NOTHING;--> statement-breakpoint
INSERT INTO "organization_settings" ("server_id", "key", "value")
SELECT o."id", 'ranobedb',
       jsonb_build_object('enabled', COALESCE((s."value" ->> 'enabled')::boolean, true))
FROM "organization" o
CROSS JOIN (SELECT "value" FROM "app_settings" WHERE "key" = 'ranobedb' LIMIT 1) s
ON CONFLICT ("server_id", "key") DO NOTHING;--> statement-breakpoint
-- Drop the leaky global Amazon credential row; strip the org-level `enabled`
-- flag from the global RanobeDB row (only dump-level keys remain there).
DELETE FROM "app_settings" WHERE "key" = 'amazon';--> statement-breakpoint
UPDATE "app_settings" SET "value" = "value" - 'enabled' WHERE "key" = 'ranobedb';