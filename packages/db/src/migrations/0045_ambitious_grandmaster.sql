CREATE TYPE "public"."recommendation_reason" AS ENUM('because_you_liked', 'same_author', 'shared_genres', 'similar_content', 'same_publisher', 'readers_also_liked', 'popular');--> statement-breakpoint
CREATE TYPE "public"."work_kind" AS ENUM('series', 'book');--> statement-breakpoint
CREATE TABLE "item_similarity" (
	"server_id" text NOT NULL,
	"seed_kind" "work_kind" NOT NULL,
	"seed_id" bigint NOT NULL,
	"cand_kind" "work_kind" NOT NULL,
	"cand_id" bigint NOT NULL,
	"score" double precision NOT NULL,
	"components" jsonb NOT NULL,
	"reason" "recommendation_reason" NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_similarity_server_id_seed_kind_seed_id_cand_kind_cand_id_pk" PRIMARY KEY("server_id","seed_kind","seed_id","cand_kind","cand_id"),
	CONSTRAINT "item_similarity_score_check" CHECK ("item_similarity"."score" >= 0 AND "item_similarity"."score" <= 1)
);
--> statement-breakpoint
CREATE TABLE "user_mix" (
	"server_id" text NOT NULL,
	"user_id" text NOT NULL,
	"mix_index" smallint NOT NULL,
	"anchor_kind" "work_kind",
	"anchor_id" bigint,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_mix_server_id_user_id_mix_index_pk" PRIMARY KEY("server_id","user_id","mix_index")
);
--> statement-breakpoint
CREATE TABLE "user_rec_state" (
	"server_id" text NOT NULL,
	"user_id" text NOT NULL,
	"signals_fp" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_rec_state_server_id_user_id_pk" PRIMARY KEY("server_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "user_recommendation" (
	"server_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" "work_kind" NOT NULL,
	"item_id" bigint NOT NULL,
	"mix_index" smallint NOT NULL,
	"score" double precision NOT NULL,
	"rank" integer NOT NULL,
	"reason" "recommendation_reason" NOT NULL,
	"reason_kind" "work_kind",
	"reason_id" bigint,
	"components" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_recommendation_server_id_user_id_kind_item_id_pk" PRIMARY KEY("server_id","user_id","kind","item_id"),
	CONSTRAINT "user_recommendation_rank_check" CHECK ("user_recommendation"."rank" >= 0)
);
--> statement-breakpoint
CREATE TABLE "work_embedding" (
	"server_id" text NOT NULL,
	"kind" "work_kind" NOT NULL,
	"item_id" bigint NOT NULL,
	"vector" real[] NOT NULL,
	"input_hash" text NOT NULL,
	"model" text NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_embedding_server_id_kind_item_id_pk" PRIMARY KEY("server_id","kind","item_id"),
	CONSTRAINT "work_embedding_dim_check" CHECK (array_length("work_embedding"."vector", 1) = 384)
);
--> statement-breakpoint
CREATE TABLE "work_popularity" (
	"server_id" text NOT NULL,
	"kind" "work_kind" NOT NULL,
	"item_id" bigint NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"completion_count" integer DEFAULT 0 NOT NULL,
	"engaged_user_count" integer DEFAULT 0 NOT NULL,
	"amazon_rating" double precision,
	"amazon_review_count" integer,
	"score" double precision NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_popularity_server_id_kind_item_id_pk" PRIMARY KEY("server_id","kind","item_id"),
	CONSTRAINT "work_popularity_score_check" CHECK ("work_popularity"."score" >= 0 AND "work_popularity"."score" <= 1)
);
--> statement-breakpoint
ALTER TABLE "item_similarity" ADD CONSTRAINT "item_similarity_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_mix" ADD CONSTRAINT "user_mix_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_mix" ADD CONSTRAINT "user_mix_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_rec_state" ADD CONSTRAINT "user_rec_state_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_rec_state" ADD CONSTRAINT "user_rec_state_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_recommendation" ADD CONSTRAINT "user_recommendation_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_recommendation" ADD CONSTRAINT "user_recommendation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "work_embedding" ADD CONSTRAINT "work_embedding_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "work_popularity" ADD CONSTRAINT "work_popularity_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "item_similarity_seed_idx" ON "item_similarity" USING btree ("server_id","seed_kind","seed_id","score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "user_recommendation_user_idx" ON "user_recommendation" USING btree ("server_id","user_id","mix_index","rank");--> statement-breakpoint
CREATE INDEX "work_popularity_score_idx" ON "work_popularity" USING btree ("server_id","score" DESC NULLS LAST);--> statement-breakpoint
DELETE FROM "app_settings" a USING "app_settings" b
	WHERE a."key" = b."key"
	AND (a."updated_at" < b."updated_at" OR (a."updated_at" = b."updated_at" AND a."id" < b."id"));--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_key_unique" UNIQUE("key");