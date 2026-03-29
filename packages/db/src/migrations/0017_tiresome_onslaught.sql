CREATE TYPE "public"."shelf_status_audiobook" AS ENUM('want_to_listen', 'backlog', 'listening', 'completed');--> statement-breakpoint
CREATE TYPE "public"."library_media_type" AS ENUM('ebook', 'audiobook');--> statement-breakpoint
ALTER TYPE "public"."activity_type" ADD VALUE 'started_listening';--> statement-breakpoint
ALTER TYPE "public"."activity_type" ADD VALUE 'completed_listening';--> statement-breakpoint
CREATE TABLE "audio_file" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"book_id" bigint NOT NULL,
	"index" integer NOT NULL,
	"filename" text NOT NULL,
	"path" text NOT NULL,
	"filesize" bigint,
	"duration" double precision NOT NULL,
	"codec" varchar(32),
	"bit_rate" integer,
	"channels" integer,
	"sample_rate" integer,
	"format" varchar(32),
	"mime_type" varchar(128),
	"disc_number" integer,
	"track_number" integer,
	"meta_tags" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audiobook_author" (
	"book_id" bigint NOT NULL,
	"author_id" bigint NOT NULL,
	"role" text,
	CONSTRAINT "audiobook_author_pkey" PRIMARY KEY("book_id","author_id")
);
--> statement-breakpoint
CREATE TABLE "audiobook_chapter" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"book_id" bigint NOT NULL,
	"index" integer NOT NULL,
	"title" text,
	"start_time" double precision NOT NULL,
	"end_time" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audiobook_genre" (
	"book_id" bigint NOT NULL,
	"genre_id" bigint NOT NULL,
	CONSTRAINT "audiobook_genre_pkey" PRIMARY KEY("book_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE "audiobook_metadata" (
	"book_id" bigint PRIMARY KEY NOT NULL,
	"title" varchar(255),
	"subtitle" varchar(255),
	"description" text,
	"published_date" date,
	"language_code" varchar(8),
	"isbn" varchar(32),
	"asin" varchar(32),
	"cover" varchar(255),
	"duration" double precision,
	"codec" varchar(32),
	"bit_rate" integer,
	"channels" integer,
	"sample_rate" integer,
	"explicit" boolean,
	"abridged" boolean,
	"publisher_id" integer,
	"series_id" integer,
	"ebook_file" jsonb
);
--> statement-breakpoint
CREATE TABLE "audiobook_series" (
	"series_id" bigint NOT NULL,
	"book_id" bigint NOT NULL,
	"position" integer,
	CONSTRAINT "audiobook_series_pkey" PRIMARY KEY("series_id","book_id")
);
--> statement-breakpoint
CREATE TABLE "book_narrator" (
	"book_id" bigint NOT NULL,
	"narrator_id" bigint NOT NULL,
	CONSTRAINT "book_narrator_pkey" PRIMARY KEY("book_id","narrator_id")
);
--> statement-breakpoint
CREATE TABLE "listening_progress" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"book_id" bigint NOT NULL,
	"current_time_seconds" double precision DEFAULT 0,
	"duration_seconds" double precision DEFAULT 0,
	"listening_time_seconds" integer DEFAULT 0,
	"status" varchar(20) DEFAULT 'unstarted',
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_listened_at" timestamp with time zone DEFAULT now(),
	"hide_from_continue" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listening_progress_user_book_unique" UNIQUE("user_id","book_id")
);
--> statement-breakpoint
CREATE TABLE "narrator" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "narrator_name_key" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "playback_session" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"book_id" bigint NOT NULL,
	"start_time" double precision,
	"current_time" double precision,
	"time_listening" double precision,
	"play_method" smallint DEFAULT 0,
	"device_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_audiobook_shelf" (
	"user_id" text NOT NULL,
	"book_id" bigint NOT NULL,
	"status" "shelf_status_audiobook" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_audiobook_shelf_pkey" PRIMARY KEY("user_id","book_id")
);
--> statement-breakpoint
ALTER TABLE "library" ADD COLUMN "media_type" "library_media_type" DEFAULT 'ebook' NOT NULL;--> statement-breakpoint
ALTER TABLE "audio_file" ADD CONSTRAINT "audio_file_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."book"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "audiobook_author" ADD CONSTRAINT "audiobook_author_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."audiobook_metadata"("book_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "audiobook_author" ADD CONSTRAINT "audiobook_author_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."author"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiobook_chapter" ADD CONSTRAINT "audiobook_chapter_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."book"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "audiobook_genre" ADD CONSTRAINT "audiobook_genre_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."audiobook_metadata"("book_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "audiobook_genre" ADD CONSTRAINT "audiobook_genre_genre_id_fkey" FOREIGN KEY ("genre_id") REFERENCES "public"."genre"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiobook_metadata" ADD CONSTRAINT "audiobook_metadata_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."book"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "audiobook_metadata" ADD CONSTRAINT "audiobook_metadata_publisher_id_fkey" FOREIGN KEY ("publisher_id") REFERENCES "public"."publisher"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiobook_metadata" ADD CONSTRAINT "audiobook_metadata_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiobook_series" ADD CONSTRAINT "audiobook_series_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiobook_series" ADD CONSTRAINT "audiobook_series_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."audiobook_metadata"("book_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "book_narrator" ADD CONSTRAINT "book_narrator_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."audiobook_metadata"("book_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "book_narrator" ADD CONSTRAINT "book_narrator_narrator_id_fkey" FOREIGN KEY ("narrator_id") REFERENCES "public"."narrator"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_progress" ADD CONSTRAINT "listening_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_progress" ADD CONSTRAINT "listening_progress_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."book"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playback_session" ADD CONSTRAINT "playback_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playback_session" ADD CONSTRAINT "playback_session_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."book"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_audiobook_shelf" ADD CONSTRAINT "user_audiobook_shelf_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_audiobook_shelf" ADD CONSTRAINT "user_audiobook_shelf_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."book"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audio_file_book_index_idx" ON "audio_file" USING btree ("book_id","index");--> statement-breakpoint
CREATE INDEX "audio_file_book_id_idx" ON "audio_file" USING btree ("book_id");--> statement-breakpoint
CREATE UNIQUE INDEX "audiobook_chapter_book_index_idx" ON "audiobook_chapter" USING btree ("book_id","index");--> statement-breakpoint
CREATE INDEX "listening_progress_user_idx" ON "listening_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "listening_progress_user_status_idx" ON "listening_progress" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "playback_session_user_idx" ON "playback_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "playback_session_book_idx" ON "playback_session" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "user_audiobook_shelf_user_idx" ON "user_audiobook_shelf" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_audiobook_shelf_status_idx" ON "user_audiobook_shelf" USING btree ("user_id","status");