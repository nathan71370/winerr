import { auth } from "@/auth/config";
import { redirect, notFound } from "next/navigation";
import { getCellarItem } from "@/cellar/queries";
import { EditBottleForm } from "./EditBottleForm";
import { listUnits, listPlacementsForItem } from "@/cave/queries";
import { compartmentKeys } from "@/cave/compartments";
import { placeBottlesAction, unplaceAction } from "@/cave/actions";
import { unplacedQuantity } from "@/cave/placement";

export default async function EditBottlePage({ params }: { params: Promise<{ itemId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { itemId } = await params;
  const b = await getCellarItem(session.user.id, itemId);
  if (!b) notFound();

  const userId = session.user.id;
  const units = await listUnits(userId);
  const itemPlacements = await listPlacementsForItem(userId, b.itemId);
  const unitOptions = units.map((u) => ({ id: u.id, name: u.name, compartments: compartmentKeys({ kind: u.kind, cols: u.cols, rows: u.rows }) }));
  const unplaced = unplacedQuantity(b.quantity, itemPlacements);

  const initial = {
    itemId: b.itemId,
    producer: b.producer ?? "",
    cuvee: b.cuvee ?? "",
    vintage: b.vintage != null ? String(b.vintage) : "",
    region: b.region ?? "",
    country: b.country ?? "",
    color: b.color ?? "rouge",
    grapes: b.grapes ?? "",
    quantity: String(b.quantity),
    purchasePrice: b.purchasePrice ?? "",
    purchaseDate: b.purchaseDate ?? "",
  };

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "var(--s-7) var(--s-5)" }}>
      <a href="/cellar" style={{ fontSize: "var(--t-small)" }}>← Ma cave</a>
      <h1 style={{ fontSize: "var(--t-h1)", marginTop: "var(--s-3)" }}>Modifier la bouteille</h1>
      <EditBottleForm initial={initial} />

      <section style={{ marginTop: "var(--s-6)" }}>
        <h2 style={{ fontSize: "var(--t-h3)", color: "var(--ink-soft)" }}>Rangement</h2>
        <p style={{ color: "var(--ink-mute)", fontSize: "var(--t-small)", marginTop: "var(--s-1)" }}>{unplaced} bouteille(s) non rangée(s).</p>

        {itemPlacements.length > 0 && (
          <ul style={{ listStyle: "none", display: "grid", gap: "var(--s-2)", marginTop: "var(--s-3)" }}>
            {itemPlacements.map((p) => {
              const unit = units.find((u) => u.id === p.unitId);
              return (
                <li key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--s-2) var(--s-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--card)" }}>
                  <span style={{ fontSize: "var(--t-small)" }}>{unit?.name ?? "?"} · {p.compartment} · ×{p.quantity}</span>
                  <form action={unplaceAction}>
                    <input type="hidden" name="placementId" value={p.id} />
                    <button style={{ background: "none", border: "1px solid var(--line)", borderRadius: "var(--radius-pill)", padding: "2px 10px", fontSize: "var(--t-meta)", color: "var(--warn)", cursor: "pointer" }}>Retirer</button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        {unplaced > 0 && unitOptions.length > 0 && (
          <form action={placeBottlesAction} style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-2)", marginTop: "var(--s-3)", alignItems: "center" }}>
            <input type="hidden" name="cellarItemId" value={b.itemId} />
            <select name="unitId" required style={sel}>
              {unitOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select name="compartment" required style={sel}>
              {unitOptions[0].compartments.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input name="quantity" type="number" min={1} max={unplaced} defaultValue={1} style={{ ...sel, width: 64 }} />
            <button style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: "var(--radius-sm)", padding: "var(--s-2) var(--s-4)", cursor: "pointer", fontSize: "var(--t-small)" }}>Ranger</button>
          </form>
        )}
        {unitOptions.length === 0 && (
          <p style={{ fontSize: "var(--t-small)", marginTop: "var(--s-3)" }}><a href="/cave/setup">Configure d’abord ta cave</a> pour ranger cette bouteille.</p>
        )}
      </section>
    </main>
  );
}

const sel: React.CSSProperties = { padding: "var(--s-2) var(--s-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--card)", fontSize: "var(--t-small)" };
