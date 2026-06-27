"use client";

import { useActionState } from "react";
import { registerAction } from "@/auth/actions";

export default function RegisterPage() {
  const [state, action, pending] = useActionState(registerAction, null);
  return (
    <main style={{ maxWidth: 360, margin: "10vh auto", padding: "var(--s-6)" }}>
      <h1 style={{ fontSize: "var(--t-h1)" }}>Créer un compte</h1>
      <form action={action} style={{ display: "grid", gap: "var(--s-3)", marginTop: "var(--s-6)" }}>
        <input name="name" placeholder="Nom" required style={inputStyle} />
        <input name="email" type="email" placeholder="Email" required style={inputStyle} />
        <input name="password" type="password" placeholder="Mot de passe (≥ 8)" required style={inputStyle} />
        {state?.error && <p style={{ color: "var(--warn)", fontSize: "var(--t-small)" }}>{state.error}</p>}
        <button disabled={pending} style={btnStyle}>{pending ? "…" : "S'inscrire"}</button>
      </form>
      <p style={{ marginTop: "var(--s-4)", fontSize: "var(--t-small)" }}>
        Déjà un compte ? <a href="/login">Se connecter</a>
      </p>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "var(--s-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)",
  background: "var(--card)", fontSize: "var(--t-body)",
};
const btnStyle: React.CSSProperties = {
  padding: "var(--s-3)", border: "none", borderRadius: "var(--radius-pill)",
  background: "var(--accent)", color: "#fff", fontSize: "var(--t-body)", cursor: "pointer",
};
