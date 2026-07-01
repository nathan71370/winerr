CREATE TYPE "public"."storage_kind" AS ENUM('grid', 'diamond');--> statement-breakpoint
CREATE TABLE "placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cellar_item_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"compartment" text NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "storage_kind" NOT NULL,
	"cols" integer,
	"rows" integer,
	"grid_x" integer DEFAULT 0 NOT NULL,
	"grid_y" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_cellar_item_id_cellar_items_id_fk" FOREIGN KEY ("cellar_item_id") REFERENCES "public"."cellar_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_unit_id_storage_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."storage_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_units" ADD CONSTRAINT "storage_units_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "placements_item_idx" ON "placements" USING btree ("cellar_item_id");--> statement-breakpoint
CREATE INDEX "placements_unit_idx" ON "placements" USING btree ("unit_id");