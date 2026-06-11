CREATE TABLE "org_member_profile" (
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"bio" text,
	"header_image" text,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_member_profile_pkey" PRIMARY KEY("user_id","organization_id")
);
--> statement-breakpoint
ALTER TABLE "org_member_profile" ADD CONSTRAINT "org_member_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_member_profile" ADD CONSTRAINT "org_member_profile_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "org_member_profile_org_idx" ON "org_member_profile" USING btree ("organization_id");