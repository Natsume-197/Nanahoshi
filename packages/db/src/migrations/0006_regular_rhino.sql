CREATE TABLE "book_genre" (
	"book_id" bigint NOT NULL,
	"genre_id" bigint NOT NULL,
	CONSTRAINT "book_genre_pkey" PRIMARY KEY("book_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE "genre" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "genre_name_key" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "book_metadata" ADD COLUMN "amazon_rating" double precision;--> statement-breakpoint
ALTER TABLE "book_metadata" ADD COLUMN "amazon_review_count" integer;--> statement-breakpoint
ALTER TABLE "book_genre" ADD CONSTRAINT "book_genre_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "public"."book_metadata"("book_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "book_genre" ADD CONSTRAINT "book_genre_genre_id_fkey" FOREIGN KEY ("genre_id") REFERENCES "public"."genre"("id") ON DELETE cascade ON UPDATE no action;