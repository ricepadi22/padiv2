CREATE TABLE "bot_dispatch_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"bot_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"dispatched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bots" ADD COLUMN "api_key_hash" text;--> statement-breakpoint
ALTER TABLE "bots" ADD COLUMN "api_key_prefix" text;--> statement-breakpoint
ALTER TABLE "bots" ADD COLUMN "provider" text DEFAULT 'http' NOT NULL;--> statement-breakpoint
ALTER TABLE "bots" ADD COLUMN "provider_config" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "bots" ADD COLUMN "last_active_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bot_dispatch_log" ADD CONSTRAINT "bot_dispatch_log_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_dispatch_log" ADD CONSTRAINT "bot_dispatch_log_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE no action ON UPDATE no action;