CREATE TABLE "invitation_link" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"code" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"max_uses" integer,
	"use_count" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_link_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "invitation_link" ADD CONSTRAINT "invitation_link_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_link" ADD CONSTRAINT "invitation_link_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitation_link_org_idx" ON "invitation_link" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_link_code_idx" ON "invitation_link" USING btree ("code");