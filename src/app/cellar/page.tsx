import { auth, signOut } from "@/auth/config";
import { redirect } from "next/navigation";
import { listCellar } from "@/cellar/queries";
import { deleteBottleAction, markDrunkAction } from "@/cellar/actions";
import { filterAndSort, filterOptions, type CellarParams } from "@/cellar/filters";
import { drinkStatus } from "@/cellar/drink-status";
import { RowRating } from "@/cellar/RowRating";
import { latestSnapshots, type Snapshot } from "@/price/queries";
import { isPriceEnabled } from "@/price/service";
import { cellarValue } from "@/price/valuation";

export default async function CellarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const sp = await searchParams;
  const windowKeys = ["young", "ready", "soon", "past"] as const;
  const params: CellarParams = {
    color: sp.color || undefined,
    region: sp.region || undefined,
    status: sp.status === "drunk" ? "drunk" : "in_cellar",
    sort: (sp.sort as CellarParams["sort"]) || "recent",
    window: windowKeys.includes(sp.window as (typeof windowKeys)[number]) ? (sp.window as CellarParams["window"]) : undefined,
  };

  const all = await listCellar(session.user.id);
  const bottles = filterAndSort(all, params);
  const options = filterOptions(all);
  const inCellar = all.filter((b) => b.status === "in_cellar");
  const snapshots = isPriceEnabled() ? await latestSnapshots([...new Set(inCellar.map((b) => b.wineId))]) : new Map<string, Snapshot>();
  const value = cellarValue(inCellar.map((b) => ({
    quantity: b.quantity,
    purchasePrice: b.purchasePrice != null ? Number(b.purchasePrice) : null,
    estimate: snapshots.get(b.wineId)?.estimate ?? null,
  })));
  const fmtEur = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;
  const year = new Date().getFullYear();

  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: "var(--s-7) var(--s-5)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ fontSize: "var(--t-h1)" }}>Ma cave</h1>
        <div style={{ display: "flex", gap: "var(--s-4)", alignItems: "baseline" }}>
          <a href="/cave" style={{ fontSize: "var(--t-small)" }}>Ma cave (3D)</a>
          <a href="/cellar/add" style={{ fontSize: "var(--t-small)" }}>+ Ajouter</a>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button style={{ background: "none", border: "none", color: "var(--ink-mute)", cursor: "pointer", fontSize: "var(--t-small)" }}>Déconnexion</button>
          </form>
        </div>
      </header>

      {value.estimated > 0 && (
        <p style={{ marginTop: "var(--s-3)", fontSize: "var(--t-small)", color: "var(--ink-soft)" }}>
          Valeur estimée : <b style={{ fontFamily: "var(--serif)", fontSize: "var(--t-h3)", color: "var(--ink)" }}>{fmtEur(value.estimated)}</b>
          {value.purchase > 0 && (
            <>
              {" "}· achat : {fmtEur(value.purchase)}
              {value.deltaPct != null && (
                <span style={{ marginLeft: "var(--s-2)", color: value.deltaPct >= 0 ? "var(--good)" : "var(--warn)", fontWeight: 600 }}>
                  {value.deltaPct >= 0 ? "+" : ""}{value.deltaPct} %
                </span>
              )}
            </>
          )}
        </p>
      )}

      <form method="get" style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-2)", marginTop: "var(--s-5)" }}>
        <select name="status" defaultValue={params.status} style={ctrl} aria-label="Statut">
          <option value="in_cellar">En cave</option>
          <option value="drunk">Bues</option>
        </select>
        <select name="color" defaultValue={params.color ?? ""} style={ctrl} aria-label="Couleur">
          <option value="">Toutes couleurs</option>
          {options.colors.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select name="region" defaultValue={params.region ?? ""} style={ctrl} aria-label="Région">
          <option value="">Toutes régions</option>
          {options.regions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select name="window" defaultValue={params.window ?? ""} style={ctrl} aria-label="Fenêtre de dégustation">
          <option value="">Toutes fenêtres</option>
          <option value="ready">À l’apogée</option>
          <option value="soon">À boire vite</option>
          <option value="young">Trop jeune</option>
          <option value="past">Apogée passée</option>
        </select>
        <select name="sort" defaultValue={params.sort} style={ctrl} aria-label="Tri">
          <option value="recent">Récents</option>
          <option value="name">Nom</option>
          <option value="vintage">Millésime</option>
          <option value="drink">À boire avant</option>
          <option value="price">Prix</option>
          <option value="rating">Note</option>
        </select>
        <button style={{ ...ctrl, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer" }}>Filtrer</button>
      </form>

      {bottles.length === 0 ? (
        <div style={{ marginTop: "var(--s-8)", textAlign: "center", padding: "var(--s-8)", border: "1px dashed var(--line)", borderRadius: "var(--radius-lg)", background: "var(--card)" }}>
          <p style={{ fontFamily: "var(--serif)", fontSize: "var(--t-h2)" }}>Aucune bouteille</p>
          <p style={{ color: "var(--ink-mute)", fontSize: "var(--t-small)", marginTop: "var(--s-2)" }}>
            <a href="/cellar/add">Ajoute une bouteille</a>.
          </p>
        </div>
      ) : (
        <ul style={{ listStyle: "none", marginTop: "var(--s-5)", display: "grid", gap: "var(--s-3)" }}>
          {bottles.map((b) => {
            const ds = drinkStatus(b.drinkFrom, b.drinkTo, year);
            return (
              <li key={b.itemId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--s-4)", border: "1px solid var(--line)", borderRadius: "var(--radius)", background: "var(--card)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)", minWidth: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- tiny DB-served thumbnail; no image optimizer on self-host */}
                  <img src={`/api/wine-image/${b.wineId}`} alt="" width={40} height={54}
                    style={{ objectFit: "cover", borderRadius: "var(--radius-sm)", border: "1px solid var(--line)", background: "var(--cream-deep)", flex: "none" }} />
                  <div>
                    <a href={`/wine/${b.wineId}`} style={{ fontFamily: "var(--serif)", fontSize: "var(--t-h3)", color: "var(--ink)" }}>
                      {b.producer}{b.cuvee ? ` · ${b.cuvee}` : ""}{b.vintage ? ` ${b.vintage}` : ""}
                    </a>
                    <div style={{ color: "var(--ink-mute)", fontSize: "var(--t-small)" }}>
                      {b.region ?? "—"} · {b.color ?? "—"} · ×{b.quantity}
                      {b.purchasePrice ? ` · ${b.purchasePrice} €` : ""}
                    </div>
                    {ds && (
                      <span style={{ display: "inline-block", marginTop: 4, fontSize: "var(--t-meta)", color: "#fff", background: ds.color, padding: "2px 8px", borderRadius: "var(--radius-pill)" }}>
                        {ds.label}
                      </span>
                    )}
                    <div style={{ marginTop: 6 }}>
                      <RowRating wineId={b.wineId} value={b.rating != null ? Number(b.rating) : null} />
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "var(--s-3)", alignItems: "center" }}>
                  <a href={`/cave?wine=${b.wineId}`} style={{ fontSize: "var(--t-meta)", color: "var(--accent-deep)" }}>Localiser</a>
                  <a href={`/cellar/${b.itemId}/edit`} style={{ fontSize: "var(--t-meta)", color: "var(--ink-soft)" }}>Éditer</a>
                  {b.status === "in_cellar" && (
                    <form action={markDrunkAction}>
                      <input type="hidden" name="itemId" value={b.itemId} />
                      <button style={miniBtn}>Bue −1</button>
                    </form>
                  )}
                  <form action={deleteBottleAction}>
                    <input type="hidden" name="itemId" value={b.itemId} />
                    <button style={{ ...miniBtn, color: "var(--warn)" }}>Suppr.</button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

const ctrl: React.CSSProperties = { padding: "var(--s-2) var(--s-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--card)", fontSize: "var(--t-small)" };
const miniBtn: React.CSSProperties = { background: "none", border: "1px solid var(--line)", borderRadius: "var(--radius-pill)", padding: "var(--s-1) var(--s-3)", fontSize: "var(--t-meta)", cursor: "pointer", color: "var(--ink-soft)" };
