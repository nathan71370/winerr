import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Applies pending Drizzle migrations from ./drizzle. Called once at server
// startup (see src/instrumentation.ts). Idempotent — drizzle tracks which
// migrations have run, so booting repeatedly is safe.
export async function runMigrations(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("[migrate] DATABASE_URL not set — skipping migrations");
    return;
  }

  // Dedicated single connection for migrations.
  const sql = postgres(url, { max: 1 });
  try {
    const maxAttempts = 10;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await migrate(drizzle(sql), { migrationsFolder: "./drizzle" });
        console.log("[migrate] migrations applied");
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (attempt === maxAttempts) {
          // Don't crash the server — log loudly and let it serve. The next
          // boot will retry. (/login works without the DB.)
          console.error(`[migrate] failed after ${maxAttempts} attempts: ${msg}`);
          return;
        }
        console.warn(`[migrate] attempt ${attempt}/${maxAttempts} failed (${msg}); retrying in 2s`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  } finally {
    await sql.end();
  }
}
