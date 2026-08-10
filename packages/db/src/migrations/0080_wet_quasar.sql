CREATE TABLE "read_listen_alignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pair_id" uuid NOT NULL,
	"artifact_path" text NOT NULL,
	"artifact_sha256" varchar(64) NOT NULL,
	"sidecar_schema" varchar(64) NOT NULL,
	"generator_name" varchar(64) NOT NULL,
	"generator_version" varchar(64) NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"ebook_sha256" varchar(64) NOT NULL,
	"audio_sha256" jsonb NOT NULL,
	"ebook_catalog_hash" text NOT NULL,
	"audiobook_catalog_hash" text NOT NULL,
	"cue_count" integer NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "read_listen_alignment_cue_count_check" CHECK ("read_listen_alignment"."cue_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "read_listen_alignment" ADD CONSTRAINT "read_listen_alignment_pair_id_read_listen_pair_id_fk" FOREIGN KEY ("pair_id") REFERENCES "public"."read_listen_pair"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "read_listen_alignment_pair_idx" ON "read_listen_alignment" USING btree ("pair_id");--> statement-breakpoint
CREATE INDEX "read_listen_alignment_artifact_idx" ON "read_listen_alignment" USING btree ("artifact_sha256");