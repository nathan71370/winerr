"use client";

import { useActionState } from "react";
import Link from "next/link";
import { registerAction } from "@/auth/actions";
import { inputStyle, btnStyle, labelStyle } from "../_styles";

export default function RegisterPage() {
  const [state, action, pending] = useActionState(registerAction, null);
  return (
    <main style={{ maxWidth: 360, margin: "10vh auto", padding: "var(--s-6)" }}>
      <h1 style={{ fontSize: "var(--t-h1)" }}>Créer un compte</h1>
      <form action={action} style={{ display: "grid", gap: "var(--s-3)", marginTop: "var(--s-6)" }}>
        <label style={labelStyle}>Nom
          <input name="name" placeholder="Nom" required autoComplete="name" style={inputStyle} />
        </label>
        <label style={labelStyle}>Email
          <input name="email" type="email" placeholder="Email" required autoComplete="email" style={inputStyle} />
        </label>
        <label style={labelStyle}>Mot de passe
          <input name="password" type="password" placeholder="Mot de passe (≥ 8)" required autoComplete="new-password" style={inputStyle} />
        </label>
        {state?.error && <p aria-live="polite" style={{ color: "var(--warn)", fontSize: "var(--t-small)" }}>{state.error}</p>}
        <button disabled={pending} style={btnStyle}>{pending ? "…" : "S'inscrire"}</button>
      </form>
      <p style={{ marginTop: "var(--s-4)", fontSize: "var(--t-small)" }}>
        Déjà un compte ? <Link href="/login">Se connecter</Link>
      </p>
    </main>
  );
}
