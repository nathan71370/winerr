import { requireUserId } from "@/auth/require-user";
import { listUnits } from "@/cave/queries";
import { deleteUnitAction } from "@/cave/actions";
import { UnitForm } from "./UnitForm";

export default async function CaveSetupPage() {
  const userId = await requireUserId();
  const units = await listUnits(userId);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "var(--s-7) var(--s-5)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ fontSize: "var(--t-h1)" }}>Configurer ma cave</h1>
        <a href="/cellar" style={{ fontSize: "var(--t-small)" }}>← Ma cave</a>
      </header>

      <section style={{ marginTop: "var(--s-5)" }}>
        <h2 style={{ fontSize: "var(--t-h3)", color: "var(--ink-soft)" }}>Mes cubes</h2>
        {units.length === 0 ? (
          <p style={{ color: "var(--ink-mute)", fontSize: "var(--t-small)", marginTop: "var(--s-3)" }}>Aucun cube. Ajoute-en un ci-dessous.</p>
        ) : (
          <ul style={{ listStyle: "none", display: "grid", gap: "var(--s-3)", marginTop: "var(--s-3)" }}>
            {units.map((u) => (
              <li key={u.id} style={{ display: "grid", gap: "var(--s-3)", padding: "var(--s-4)", border: "1px solid var(--line)", borderRadius: "var(--radius)", background: "var(--card)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <b style={{ fontFamily: "var(--serif)", fontSize: "var(--t-h3)" }}>{u.name}</b>
                  <span style={{ color: "var(--ink-mute)", fontSize: "var(--t-small)" }}>
                    {u.kind === "grid" ? `Grille ${u.cols}×${u.rows}` : "Losange · 4 comp."} · pos {u.gridX}·{u.gridY}
                  </span>
                </div>
                <UnitForm unit={u} />
                <form action={deleteUnitAction}>
                  <input type="hidden" name="unitId" value={u.id} />
                  <button style={{ background: "none", border: "1px solid var(--line)", borderRadius: "var(--radius-pill)", padding: "var(--s-1) var(--s-3)", fontSize: "var(--t-meta)", color: "var(--warn)", cursor: "pointer" }}>
                    Supprimer ce cube (les bouteilles reviennent « à ranger »)
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: "var(--s-6)" }}>
        <h2 style={{ fontSize: "var(--t-h3)", color: "var(--ink-soft)", marginBottom: "var(--s-3)" }}>Ajouter un cube</h2>
        <UnitForm />
      </section>
    </main>
  );
}
