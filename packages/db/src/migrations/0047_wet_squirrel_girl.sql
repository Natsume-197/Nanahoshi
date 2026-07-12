CREATE TYPE "public"."recommendation_feedback_type" AS ENUM('not_interested');--> statement-breakpoint
CREATE TABLE "user_recommendation_feedback" (
	"server_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" "work_kind" NOT NULL,
	"item_id" bigint NOT NULL,
	"type" "recommendation_feedback_type" DEFAULT 'not_interested' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_recommendation_feedback_server_id_user_id_kind_item_id_pk" PRIMARY KEY("server_id","user_id","kind","item_id")
);
--> statement-breakpoint
ALTER TABLE "user_recommendation_feedback" ADD CONSTRAINT "user_recommendation_feedback_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_recommendation_feedback" ADD CONSTRAINT "user_recommendation_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE cascade;