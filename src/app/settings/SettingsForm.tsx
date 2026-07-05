"use client";

import { useActionState } from "react";
import { saveSettingsAction } from "@/settings/actions";

type SettingsState = {
  provider: "mistral" | "gemini";
  hasMistral: boolean;
  hasGemini: boolean;
  hasTavily: boolean;
};

export function SettingsForm({ state: initial }: { state: SettingsState }) {
  const [state, action, pending] = useActionState(saveSettingsAction, null);

  return (
    <form action={action} style={{ display: "grid", gap: "var(--s-4)", marginTop: "var(--s-5)" }}>
      <fieldset style={{ border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: "var(--s-4)", display: "grid", gap: "var(--s-2)" }}>
        <legend style={{ fontSize: "var(--t-small)", color: "var(--ink-soft)", padding: "0 var(--s-2)" }}>Fournisseur IA</legend>
        <label style={radioLbl}>
          <input type="radio" name="aiProvider" value="mistral" defaultChecked={initial.provider === "mistral"} />
          Mistral — gratuit (console.mistral.ai, sans carte)
        </label>
        <label style={radioLbl}>
          <input type="radio" name="aiProvider" value="gemini" defaultChecked={initial.provider === "gemini"} />
          Gemini — payant en Europe (tier gratuit indisponible en UE)
        </label>
      </fieldset>

      <label style={lbl}>Clé Mistral
        <input
          name="mistralApiKey"
          type="password"
          autoComplete="off"
          placeholder={initial.hasMistral ? "Clé configurée ✓ — laisser vide pour conserver" : "sk-…"}
          style={inp}
        />
      </label>
      {initial.hasMistral && (
        <label style={checkboxLbl}>
          <input type="checkbox" name="clearMistral" value="on" />
          Effacer la clé Mistral
        </label>
      )}

      <label style={lbl}>Clé Gemini
        <input
          name="geminiApiKey"
          type="password"
          autoComplete="off"
          placeholder={initial.hasGemini ? "Clé configurée ✓ — laisser vide pour conserver" : "AIza…"}
          style={inp}
        />
      </label>
      {initial.hasGemini && (
        <label style={checkboxLbl}>
          <input type="checkbox" name="clearGemini" value="on" />
          Effacer la clé Gemini
        </label>
      )}

      <label style={lbl}>Clé Tavily — gratuite, sans carte (app.tavily.com) — requise pour l&apos;enrichissement web et les cotes
        <input
          name="tavilyApiKey"
          type="password"
          autoComplete="off"
          placeholder={initial.hasTavily ? "Clé configurée ✓ — laisser vide pour conserver" : "tvly-…"}
          style={inp}
        />
      </label>
      {initial.hasTavily && (
        <label style={checkboxLbl}>
          <input type="checkbox" name="clearTavily" value="on" />
          Effacer la clé Tavily
        </label>
      )}

      {state?.error && <p aria-live="polite" style={{ color: "var(--warn)", fontSize: "var(--t-small)" }}>{state.error}</p>}
      {state?.ok && <p aria-live="polite" style={{ color: "var(--good)", fontSize: "var(--t-small)" }}>Réglages enregistrés.</p>}

      <button disabled={pending} style={btn}>{pending ? "…" : "Enregistrer"}</button>
      <p style={{ fontSize: "var(--t-meta)", color: "var(--ink-mute)" }}>Tes clés restent sur ton serveur, chiffrées.</p>
    </form>
  );
}

const lbl: React.CSSProperties = { display: "grid", gap: 4, fontSize: "var(--t-small)", color: "var(--ink-soft)" };
const inp: React.CSSProperties = { padding: "var(--s-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--card)", fontSize: "var(--t-body)" };
const btn: React.CSSProperties = { padding: "var(--s-3)", border: "none", borderRadius: "var(--radius-pill)", background: "var(--accent)", color: "#fff", fontSize: "var(--t-body)", cursor: "pointer" };
const radioLbl: React.CSSProperties = { display: "flex", alignItems: "center", gap: "var(--s-2)", fontSize: "var(--t-small)", color: "var(--ink)" };
const checkboxLbl: React.CSSProperties = { display: "flex", alignItems: "center", gap: "var(--s-2)", fontSize: "var(--t-meta)", color: "var(--ink-mute)" };
