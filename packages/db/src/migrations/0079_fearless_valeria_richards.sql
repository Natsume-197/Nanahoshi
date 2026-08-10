CREATE TABLE "read_listen_pair" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" text NOT NULL,
	"ebook_book_id" bigint NOT NULL,
	"audiobook_book_id" bigint NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "read_listen_pair_distinct_sources_check" CHECK ("read_listen_pair"."ebook_book_id" <> "read_listen_pair"."audiobook_book_id")
);
--> statement-breakpoint
ALTER TABLE "read_listen_pair" ADD CONSTRAINT "read_listen_pair_server_id_organization_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read_listen_pair" ADD CONSTRAINT "read_listen_pair_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read_listen_pair" ADD CONSTRAINT "read_listen_pair_ebook_book_id_fkey" FOREIGN KEY ("ebook_book_id") REFERENCES "public"."book"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "read_listen_pair" ADD CONSTRAINT "read_listen_pair_audiobook_book_id_fkey" FOREIGN KEY ("audiobook_book_id") REFERENCES "public"."book"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "read_listen_pair_sources_idx" ON "read_listen_pair" USING btree ("ebook_book_id","audiobook_book_id");--> statement-breakpoint
CREATE INDEX "read_listen_pair_server_idx" ON "read_listen_pair" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "read_listen_pair_ebook_idx" ON "read_listen_pair" USING btree ("ebook_book_id");--> statement-breakpoint
CREATE INDEX "read_listen_pair_audiobook_idx" ON "read_listen_pair" USING btree ("audiobook_book_id");