CREATE TABLE "security_audit_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_type" text NOT NULL,
	"outcome" text NOT NULL,
	"source" text NOT NULL,
	"actor_user_id" text,
	"actor_name" text,
	"subject_user_id" text,
	"subject_name" text,
	"subject_identifier" text,
	"session_id" text,
	"device" text,
	"ip_address" text,
	"server_id" text,
	"server_name" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "security_audit_event_created_at_idx" ON "security_audit_event" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "security_audit_event_subject_created_at_idx" ON "security_audit_event" USING btree ("subject_user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "security_audit_event_source_outcome_created_at_idx" ON "security_audit_event" USING btree ("source","outcome","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "security_audit_event_server_created_at_idx" ON "security_audit_event" USING btree ("server_id","created_at" DESC NULLS LAST);