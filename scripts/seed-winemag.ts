import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import { lwinWines } from "../src/db/schema";
import { parseWinemagCsv } from "../src/winemag/import";

const DEFAULT_URL = "https://raw.githubusercontent.com/davestroud/Wine/master/winemag-data-130k-v2.csv";

async function loadCsv(src: string): Promise<string> {
  if (existsSync(src)) return readFileSync(src, "utf8");
  if (src.startsWith("http")) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    return res.text();
  }
  throw new Error(`not a file or URL: ${src}`);
}

async function main() {
  const src = process.argv[2] ?? DEFAULT_URL;
  console.log(`[winemag] loading ${src} ...`);
  const csv = await loadCsv(src);
  const rows = parseWinemagCsv(csv);
  console.log(`[winemag] parsed ${rows.length} unique wines; upserting...`);
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
    console.log(`[winemag] upserted ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  console.log("[winemag] done");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
