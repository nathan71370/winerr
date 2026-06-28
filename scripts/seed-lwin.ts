import "dotenv/config";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { lwinWines } from "../src/db/schema";
import { parseLwinCsv } from "../src/lwin/import";

async function main() {
  const path = process.argv[2] ?? process.env.LWIN_CSV_PATH;
  if (!path) {
    console.error("Usage: pnpm db:seed:lwin <path-to-lwin.csv>");
    process.exit(1);
  }
  const rows = parseLwinCsv(readFileSync(path, "utf8"));
  console.log(`[lwin] parsed ${rows.length} rows; upserting...`);
  const BATCH = 1000;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await db
      .insert(lwinWines)
      .values(batch)
      .onConflictDoUpdate({
        target: lwinWines.lwin,
        set: {
          displayName: sql`excluded.display_name`,
          producer: sql`excluded.producer`,
          wine: sql`excluded.wine`,
          region: sql`excluded.region`,
          country: sql`excluded.country`,
          colour: sql`excluded.colour`,
          type: sql`excluded.type`,
        },
      });
    console.log(`[lwin] upserted ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  console.log("[lwin] done");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
