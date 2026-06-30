CREATE TABLE "wine_images" (
	"wine_id" uuid PRIMARY KEY NOT NULL,
	"data" text NOT NULL,
	"mime" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wine_images" ADD CONSTRAINT "wine_images_wine_id_wines_id_fk" FOREIGN KEY ("wine_id") REFERENCES "public"."wines"("id") ON DELETE cascade ON UPDATE no action;