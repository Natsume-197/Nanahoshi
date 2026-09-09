CREATE TABLE "audiobook_series_identity" (
	"server_id" text NOT NULL,
	"provider" text NOT NULL,
	"region" text NOT NULL,
	"provider_id" text NOT NULL,
	"series_id" bigint NOT NULL,
	CONSTRAINT "audiobook_series_identity_server_id_provider_region_provider_id_pk" PRIMARY KEY("server_id","provider","region","provider_id")
);
--> statement-breakpoint
ALTER TABLE "audiobook_series" ADD COLUMN "sequence" text;--> statement-breakpoint
ALTER TABLE "audiobook_series_identity" ADD CONSTRAINT "audiobook_series_identity_server_id_organization_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiobook_series_identity" ADD CONSTRAINT "audiobook_series_identity_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audiobook_series_identity_series_provider_region_key" ON "audiobook_series_identity" USING btree ("series_id","provider","region");