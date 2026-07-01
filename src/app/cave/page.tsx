import { requireUserId } from "@/auth/require-user";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { wines } from "@/db/schema";
import { listUnits, unplacedTray, caveContents, locateWinePlacements } from "@/cave/queries";
import { highlightSet } from "@/cave/group";
import { CaveBoard, type BoardUnit, type TrayItem } from "./CaveBoard";

export default async function CavePage({ searchParams }: { searchParams: Promise<{ wine?: string }> }) {
  const userId = await requireUserId();
  const sp = await searchParams;

  const [units, tray, contents] = await Promise.all([
    listUnits(userId),
    unplacedTray(userId),
    caveContents(userId),
  ]);

  const boardUnits: BoardUnit[] = units.map((u) => ({ id: u.id, name: u.name, kind: u.kind, cols: u.cols, rows: u.rows, gridX: u.gridX, gridY: u.gridY }));
  const trayItems: TrayItem[] = tray.map((t) => ({ itemId: t.itemId, producer: t.producer, cuvee: t.cuvee, vintage: t.vintage, color: t.color, unplaced: t.unplaced }));

  let highlight: string[] = [];
  let locate: { wineLabel: string } | null = null;
  if (sp.wine) {
    const placements = await locateWinePlacements(userId, sp.wine);
    highlight = [...highlightSet(placements)];
    const w = (await db.select({ producer: wines.producer, cuvee: wines.cuvee, vintage: wines.vintage }).from(wines).where(eq(wines.id, sp.wine)).limit(1))[0];
    if (w) locate = { wineLabel: `${w.producer}${w.cuvee ? " · " + w.cuvee : ""}${w.vintage ? " " + w.vintage : ""}` };
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "var(--s-7) var(--s-5)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ fontSize: "var(--t-h1)" }}>Ma cave</h1>
        <div style={{ display: "flex", gap: "var(--s-4)", alignItems: "baseline" }}>
          <a href="/cave/setup" style={{ fontSize: "var(--t-small)" }}>Configurer</a>
          <a href="/cellar" style={{ fontSize: "var(--t-small)" }}>Liste</a>
        </div>
      </header>

      {boardUnits.length === 0 ? (
        <div style={{ marginTop: "var(--s-8)", textAlign: "center", padding: "var(--s-8)", border: "1px dashed var(--line)", borderRadius: "var(--radius-lg)", background: "var(--card)" }}>
          <p style={{ fontFamily: "var(--serif)", fontSize: "var(--t-h2)" }}>Cave vide</p>
          <p style={{ color: "var(--ink-mute)", fontSize: "var(--t-small)", marginTop: "var(--s-2)" }}><a href="/cave/setup">Configure tes cubes</a> pour commencer.</p>
        </div>
      ) : (
        <div style={{ marginTop: "var(--s-5)" }}>
          <CaveBoard units={boardUnits} contents={contents} tray={trayItems} highlight={highlight} locate={locate} />
        </div>
      )}
    </main>
  );
}
