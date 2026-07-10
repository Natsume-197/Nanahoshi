CREATE TABLE "audiobook_tag" (
	"book_id" bigint NOT NULL,
	"tag_id" bigint NOT NULL,
	CONSTRAINT "audiobook_tag_pkey" PRIMARY KEY("book_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "book_tag" (
	"book_id" bigint NOT NULL,
	"tag_id" bigint NOT NULL,
	CONSTRAINT "book_tag_pkey" PRIMARY KEY("book_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tag" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"uuid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"server_id" text NOT NULL,
	CONSTRAINT "tag_name_key" UNIQUE("server_id","name")
);
--> statement-breakpoint
ALTER TABLE "audiobook_tag" ADD CONSTRAINT "audiobook_tag_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."audiobook_metadata"("book_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "audiobook_tag" ADD CONSTRAINT "audiobook_tag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_tag" ADD CONSTRAINT "book_tag_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."book_metadata"("book_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "book_tag" ADD CONSTRAINT "book_tag_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag" ADD CONSTRAINT "tag_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tag_uuid_idx" ON "tag" USING btree ("uuid");--> statement-breakpoint
CREATE INDEX "tag_server_id_idx" ON "tag" USING btree ("server_id");