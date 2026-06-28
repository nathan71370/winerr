// Runs once when the server process starts. We use it to apply database
// migrations on boot so a fresh deployment (e.g. via Komodo) is self-contained.
// The dynamic import lives INSIDE the `=== "nodejs"` check so Next only bundles
// the Node-only migration code (postgres driver) for the Node runtime, never edge.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runMigrations } = await import("@/db/migrate");
    await runMigrations();
  }
}
