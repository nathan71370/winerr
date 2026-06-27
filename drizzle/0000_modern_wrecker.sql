CREATE TYPE "public"."cellar_status" AS ENUM('in_cellar', 'drunk');--> statement-breakpoint
CREATE TYPE "public"."wine_color" AS ENUM('rouge', 'blanc', 'rose', 'effervescent');--> statement-breakpoint
CREATE TABLE "cellar_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wine_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"purchase_price" numeric(10, 2),
	"purchase_date" date,
	"drink_from" integer,
	"drink_before" integer,
	"location" text,
	"my_photo" text,
	"status" "cellar_status" DEFAULT 'in_cellar' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wine_id" uuid NOT NULL,
	"estimate" numeric(10, 2),
	"low" numeric(10, 2),
	"high" numeric(10, 2),
	"currency" text DEFAULT 'EUR' NOT NULL,
	"source" text,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wine_id" uuid NOT NULL,
	"rating" numeric(2, 1),
	"tasting_note" text,
	"tasted_at" date,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"producer" text NOT NULL,
	"cuvee" text,
	"vintage" integer,
	"region" text,
	"country" text,
	"color" "wine_color",
	"grapes" text,
	"ref_label_image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_wine" UNIQUE("producer","cuvee","vintage")
);
--> statement-breakpoint
ALTER TABLE "cellar_items" ADD CONSTRAINT "cellar_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cellar_items" ADD CONSTRAINT "cellar_items_wine_id_wines_id_fk" FOREIGN KEY ("wine_id") REFERENCES "public"."wines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_wine_id_wines_id_fk" FOREIGN KEY ("wine_id") REFERENCES "public"."wines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_wine_id_wines_id_fk" FOREIGN KEY ("wine_id") REFERENCES "public"."wines"("id") ON DELETE no action ON UPDATE no action;