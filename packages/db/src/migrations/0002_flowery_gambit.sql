CREATE TABLE "discord_access_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"role_id" text,
	"label" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discord_access_rule" ADD CONSTRAINT "discord_access_rule_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discord_access_rule_org_idx" ON "discord_access_rule" USING btree ("organization_id");