import { auth, signOut } from "@/auth/config";

export default async function CellarPage() {
  const session = await auth();
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "var(--s-7) var(--s-5)" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ fontSize: "var(--t-h1)" }}>Ma cave</h1>
        <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
          <button style={{ background: "none", border: "none", color: "var(--ink-mute)", cursor: "pointer", fontSize: "var(--t-small)" }}>
            Déconnexion
          </button>
        </form>
      </header>
      <p style={{ color: "var(--ink-mute)", marginTop: "var(--s-2)" }}>
        Bonjour {session?.user?.name ?? "amateur de vin"}.
      </p>
      <div style={{ marginTop: "var(--s-8)", textAlign: "center", padding: "var(--s-8)", border: "1px dashed var(--line)", borderRadius: "var(--radius-lg)", background: "var(--card)" }}>
        <p style={{ fontFamily: "var(--serif)", fontSize: "var(--t-h2)" }}>Ta cave est vide</p>
        <p style={{ color: "var(--ink-mute)", fontSize: "var(--t-small)", marginTop: "var(--s-2)" }}>
          L'ajout de bouteilles arrive en Phase 2.
        </p>
      </div>
    </main>
  );
}
