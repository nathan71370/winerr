import { auth, signOut } from "@/auth/config";
import { redirect } from "next/navigation";
import { listCellar } from "@/cellar/queries";
import { deleteBottleAction, markDrunkAction } from "@/cellar/actions";

export default async function CellarPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const bottles = await listCellar(session.user.id);

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "var(--s-7) var(--s-5)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ fontSize: "var(--t-h1)" }}>Ma cave</h1>
        <div style={{ display: "flex", gap: "var(--s-4)", alignItems: "baseline" }}>
          <a href="/cellar/add" style={{ fontSize: "var(--t-small)" }}>+ Ajouter</a>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
            <button style={{ background: "none", border: "none", color: "var(--ink-mute)", cursor: "pointer", fontSize: "var(--t-small)" }}>Déconnexion</button>
          </form>
        </div>
      </header>

      {bottles.length === 0 ? (
        <div style={{ marginTop: "var(--s-8)", textAlign: "center", padding: "var(--s-8)", border: "1px dashed var(--line)", borderRadius: "var(--radius-lg)", background: "var(--card)" }}>
          <p style={{ fontFamily: "var(--serif)", fontSize: "var(--t-h2)" }}>Ta cave est vide</p>
          <p style={{ color: "var(--ink-mute)", fontSize: "var(--t-small)", marginTop: "var(--s-2)" }}>
            <a href="/cellar/add">Ajoute ta première bouteille</a>.
          </p>
        </div>
      ) : (
        <ul style={{ listStyle: "none", marginTop: "var(--s-6)", display: "grid", gap: "var(--s-3)" }}>
          {bottles.map((b) => (
            <li key={b.itemId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--s-4)", border: "1px solid var(--line)", borderRadius: "var(--radius)", background: "var(--card)" }}>
              <div>
                <div style={{ fontFamily: "var(--serif)", fontSize: "var(--t-h3)" }}>
                  {b.producer}{b.cuvee ? ` · ${b.cuvee}` : ""}{b.vintage ? ` ${b.vintage}` : ""}
                </div>
                <div style={{ color: "var(--ink-mute)", fontSize: "var(--t-small)" }}>
                  {b.region ?? "—"} · {b.color ?? "—"} · ×{b.quantity}
                  {b.purchasePrice ? ` · ${b.purchasePrice} €` : ""}
                </div>
                {b.drinkFrom && b.drinkTo && (
                  <div style={{ color: "var(--sage)", fontSize: "var(--t-meta)", marginTop: 2 }}>
                    À boire {b.drinkFrom}–{b.drinkTo}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: "var(--s-3)", alignItems: "center" }}>
                <form action={markDrunkAction}>
                  <input type="hidden" name="itemId" value={b.itemId} />
                  <button style={miniBtn}>Bue −1</button>
                </form>
                <form action={deleteBottleAction}>
                  <input type="hidden" name="itemId" value={b.itemId} />
                  <button style={{ ...miniBtn, color: "var(--warn)" }}>Suppr.</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

const miniBtn: React.CSSProperties = { background: "none", border: "1px solid var(--line)", borderRadius: "var(--radius-pill)", padding: "var(--s-1) var(--s-3)", fontSize: "var(--t-meta)", cursor: "pointer", color: "var(--ink-soft)" };
