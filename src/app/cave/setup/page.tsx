import { requireUserId } from "@/auth/require-user";
import { listUnits } from "@/cave/queries";
import { CellarBuilder } from "./CellarBuilder";
import type { CubeRow } from "./CubeForm";

export default async function CaveSetupPage() {
  const userId = await requireUserId();
  const units = await listUnits(userId);
  const rows: CubeRow[] = units.map((u) => ({ id: u.id, name: u.name, kind: u.kind, cols: u.cols, rows: u.rows, gridX: u.gridX, gridY: u.gridY }));

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "var(--s-7) var(--s-5)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "var(--s-5)" }}>
        <h1 style={{ fontSize: "var(--t-h1)" }}>Configurer ma cave</h1>
        <div style={{ display: "flex", gap: "var(--s-4)", alignItems: "baseline" }}>
          <a href="/cave" style={{ fontSize: "var(--t-small)" }}>Vue 3D</a>
          <a href="/cellar" style={{ fontSize: "var(--t-small)" }}>Liste</a>
        </div>
      </header>
      <CellarBuilder units={rows} />
    </main>
  );
}
