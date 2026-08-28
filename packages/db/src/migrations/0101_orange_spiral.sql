ALTER TABLE "account" ADD COLUMN "issuer" text;--> statement-breakpoint
UPDATE "account"
SET "issuer" = CASE
	WHEN "provider_id" = 'credential' THEN 'local:credential'
	WHEN "provider_id" = 'discord' THEN 'local:oauth:discord'
	ELSE NULL
END;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM "account" WHERE "issuer" IS NULL) THEN
		RAISE EXCEPTION 'Cannot migrate Better Auth accounts: issuer mapping is missing for one or more providers';
	END IF;
END
$$;--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "issuer" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_accountId_uidx" ON "account" USING btree ("issuer","account_id");
