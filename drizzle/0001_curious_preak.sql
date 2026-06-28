CREATE TABLE "lwin_wines" (
	"lwin" text PRIMARY KEY NOT NULL,
	"display_name" text,
	"producer" text,
	"wine" text,
	"region" text,
	"country" text,
	"colour" text,
	"type" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wines" ADD COLUMN "lwin_code" text;--> statement-breakpoint
ALTER TABLE "wines" ADD COLUMN "drink_from" integer;--> statement-breakpoint
ALTER TABLE "wines" ADD COLUMN "drink_to" integer;--> statement-breakpoint
ALTER TABLE "wines" ADD COLUMN "drink_window_confidence" numeric(3, 2);--> statement-breakpoint
ALTER TABLE "wines" ADD COLUMN "drink_window_source" text;--> statement-breakpoint
ALTER TABLE "wines" ADD COLUMN "drink_window_fetched_at" timestamp;