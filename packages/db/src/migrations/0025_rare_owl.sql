-- Catalog (author/series/genre/publisher/narrator) becomes per-server. Pre-launch:
-- wipe these + their links so the new NOT NULL server_id applies; a rescan/re-enrich
-- rebuilds them scoped per server. Order respects FKs into the catalog tables.
DELETE FROM "book_author";--> statement-breakpoint
DELETE FROM "book_series";--> statement-breakpoint
DELETE FROM "book_genre";--> statement-breakpoint
DELETE FROM "book_narrator";--> statement-breakpoint
DELETE FROM "audiobook_author";--> statement-breakpoint
DELETE FROM "audiobook_series";--> statement-breakpoint
DELETE FROM "audiobook_genre";--> statement-breakpoint
UPDATE "book_metadata" SET "publisher_id" = NULL, "series_id" = NULL;--> statement-breakpoint
UPDATE "audiobook_metadata" SET "publisher_id" = NULL, "series_id" = NULL;--> statement-breakpoint
DELETE FROM "author";--> statement-breakpoint
DELETE FROM "series";--> statement-breakpoint
DELETE FROM "genre";--> statement-breakpoint
DELETE FROM "publisher";--> statement-breakpoint
DELETE FROM "narrator";--> statement-breakpoint
ALTER TABLE "org_member_profile" RENAME TO "server_member_profile";--> statement-breakpoint
ALTER TABLE "collection" RENAME COLUMN "organization_id" TO "server_id";--> statement-breakpoint
ALTER TABLE "discord_access_rule" RENAME COLUMN "organization_id" TO "server_id";--> statement-breakpoint
ALTER TABLE "invitation_link" RENAME COLUMN "organization_id" TO "server_id";--> statement-breakpoint
ALTER TABLE "library" RENAME COLUMN "organization_id" TO "server_id";--> statement-breakpoint
ALTER TABLE "library_permission_overwrite" RENAME COLUMN "organization_id" TO "server_id";--> statement-breakpoint
ALTER TABLE "liked_book" RENAME COLUMN "organization_id" TO "server_id";--> statement-breakpoint
ALTER TABLE "member_role" RENAME COLUMN "organization_id" TO "server_id";--> statement-breakpoint
ALTER TABLE "server_member_profile" RENAME COLUMN "organization_id" TO "server_id";--> statement-breakpoint
ALTER TABLE "role" RENAME COLUMN "organization_id" TO "server_id";--> statement-breakpoint
ALTER TABLE "author" DROP CONSTRAINT "authors_provider_name_key";--> statement-breakpoint
ALTER TABLE "author" DROP CONSTRAINT "authors_amazon_asin_key";--> statement-breakpoint
ALTER TABLE "collection" DROP CONSTRAINT "collections_user_org_name_key";--> statement-breakpoint
ALTER TABLE "genre" DROP CONSTRAINT "genre_name_key";--> statement-breakpoint
ALTER TABLE "narrator" DROP CONSTRAINT "narrator_name_key";--> statement-breakpoint
ALTER TABLE "publisher" DROP CONSTRAINT "publishers_name_key";--> statement-breakpoint
ALTER TABLE "series" DROP CONSTRAINT "series_name_key";--> statement-breakpoint
ALTER TABLE "collection" DROP CONSTRAINT "collections_organization_id_fkey";
--> statement-breakpoint
ALTER TABLE "discord_access_rule" DROP CONSTRAINT "discord_access_rule_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "invitation_link" DROP CONSTRAINT "invitation_link_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "library" DROP CONSTRAINT "library_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "library_permission_overwrite" DROP CONSTRAINT "library_permission_overwrite_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "liked_book" DROP CONSTRAINT "liked_books_organization_id_fkey";
--> statement-breakpoint
ALTER TABLE "member_role" DROP CONSTRAINT "member_role_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "server_member_profile" DROP CONSTRAINT "org_member_profile_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "server_member_profile" DROP CONSTRAINT "org_member_profile_organization_id_fkey";
--> statement-breakpoint
ALTER TABLE "role" DROP CONSTRAINT "role_organization_id_organization_id_fk";
--> statement-breakpoint
DROP INDEX "org_member_profile_org_idx";--> statement-breakpoint
DROP INDEX "discord_access_rule_org_idx";--> statement-breakpoint
DROP INDEX "invitation_link_org_idx";--> statement-breakpoint
DROP INDEX "liked_book_user_org_idx";--> statement-breakpoint
DROP INDEX "member_role_user_org_idx";--> statement-breakpoint
DROP INDEX "role_org_name_idx";--> statement-breakpoint
DROP INDEX "role_org_idx";--> statement-breakpoint
ALTER TABLE "server_member_profile" DROP CONSTRAINT "org_member_profile_pkey";--> statement-breakpoint
ALTER TABLE "server_member_profile" ADD CONSTRAINT "server_member_profile_pkey" PRIMARY KEY("user_id","server_id");--> statement-breakpoint
ALTER TABLE "author" ADD COLUMN "server_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "genre" ADD COLUMN "server_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "narrator" ADD COLUMN "server_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "publisher" ADD COLUMN "server_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "server_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "author" ADD CONSTRAINT "author_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collections_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discord_access_rule" ADD CONSTRAINT "discord_access_rule_server_id_organization_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "genre" ADD CONSTRAINT "genre_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_link" ADD CONSTRAINT "invitation_link_server_id_organization_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library" ADD CONSTRAINT "library_server_id_organization_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_permission_overwrite" ADD CONSTRAINT "library_permission_overwrite_server_id_organization_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "liked_book" ADD CONSTRAINT "liked_books_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_role" ADD CONSTRAINT "member_role_server_id_organization_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narrator" ADD CONSTRAINT "narrator_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_member_profile" ADD CONSTRAINT "server_member_profile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_member_profile" ADD CONSTRAINT "server_member_profile_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publisher" ADD CONSTRAINT "publisher_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_server_id_organization_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "author_server_id_idx" ON "author" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "genre_server_id_idx" ON "genre" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "narrator_server_id_idx" ON "narrator" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "server_member_profile_org_idx" ON "server_member_profile" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "publisher_server_id_idx" ON "publisher" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "series_server_id_idx" ON "series" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "discord_access_rule_org_idx" ON "discord_access_rule" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "invitation_link_org_idx" ON "invitation_link" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "liked_book_user_org_idx" ON "liked_book" USING btree ("user_id","server_id");--> statement-breakpoint
CREATE INDEX "member_role_user_org_idx" ON "member_role" USING btree ("user_id","server_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_org_name_idx" ON "role" USING btree ("server_id","name");--> statement-breakpoint
CREATE INDEX "role_org_idx" ON "role" USING btree ("server_id");--> statement-breakpoint
ALTER TABLE "liked_book" DROP CONSTRAINT "liked_books_pkey";
--> statement-breakpoint
ALTER TABLE "liked_book" ADD CONSTRAINT "liked_books_pkey" PRIMARY KEY("user_id","book_id","server_id");--> statement-breakpoint
ALTER TABLE "author" ADD CONSTRAINT "authors_provider_name_key" UNIQUE("server_id","name","provider");--> statement-breakpoint
ALTER TABLE "author" ADD CONSTRAINT "authors_amazon_asin_key" UNIQUE("server_id","amazon_asin");--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collections_user_org_name_key" UNIQUE("user_id","server_id","name");--> statement-breakpoint
ALTER TABLE "genre" ADD CONSTRAINT "genre_name_key" UNIQUE("server_id","name");--> statement-breakpoint
ALTER TABLE "narrator" ADD CONSTRAINT "narrator_name_key" UNIQUE("server_id","name");--> statement-breakpoint
ALTER TABLE "publisher" ADD CONSTRAINT "publishers_name_key" UNIQUE("server_id","name");--> statement-breakpoint
ALTER TABLE "series" ADD CONSTRAINT "series_name_key" UNIQUE("server_id","name");