// Runs once when the server process starts. We use it to apply database
// migrations on boot so a fresh deployment (e.g. via Komodo) is self-contained.
// The dynamic import lives INSIDE the `=== "nodejs"` check so Next only bundles
// the Node-only migration code (postgres driver) for the Node runtime, never edge.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Fail fast at BOOT (never at build — the Docker builder stage has no
    // runtime env) when a required secret is missing.
    if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET is not set");

    const { runMigrations } = await import("@/db/migrate");
    await runMigrations();

    const { startPriceScheduler } = await import("@/price/scheduler");
    startPriceScheduler();
  }
}
