-- PRE-DEPLOY CHECK: this constraint will fail to apply if the live DB already
-- holds duplicate (producer, cuvee, vintage) rows with NULLs (previously
-- allowed under NULLS DISTINCT). Run against prod BEFORE deploying and resolve
-- any hit (merge the duplicate wines):
--   SELECT producer, cuvee, vintage, count(*) FROM wines
--   GROUP BY 1, 2, 3 HAVING count(*) > 1;
ALTER TABLE "wines" DROP CONSTRAINT "uniq_wine";--> statement-breakpoint
ALTER TABLE "wines" ADD CONSTRAINT "uniq_wine" UNIQUE NULLS NOT DISTINCT("producer","cuvee","vintage");
