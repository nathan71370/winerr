ALTER TABLE "wines" DROP CONSTRAINT "uniq_wine";--> statement-breakpoint
ALTER TABLE "wines" ADD CONSTRAINT "uniq_wine" UNIQUE NULLS NOT DISTINCT("producer","cuvee","vintage");