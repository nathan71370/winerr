"use client";

import { useActionState, useState } from "react";
import { updateBottleAction } from "@/cellar/actions";

type Initial = {
  itemId: string;
  producer: string; cuvee: string; vintage: string; region: string; country: string;
  color: string; grapes: string; quantity: string; purchasePrice: string; purchaseDate: string;
};

export function EditBottleForm({ initial }: { initial: Initial }) {
  const [state, action, pending] = useActionState(updateBottleAction, null);
  const [form, setForm] = useState(initial);
  const set = (k: keyof Initial, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <form action={action} style={{ display: "grid", gap: "var(--s-3)", marginTop: "var(--s-5)" }}>
      <input type="hidden" name="itemId" value={form.itemId} />
      <label style={lbl}>Domaine
        <input name="producer" value={form.producer} required onChange={(e) => set("producer", e.target.value)} style={inp} />
      </label>
      <label style={lbl}>Cuvée
        <input name="cuvee" value={form.cuvee} onChange={(e) => set("cuvee", e.target.value)} style={inp} />
      </label>
      <label style={lbl}>Millésime
        <input name="vintage" value={form.vintage} inputMode="numeric" onChange={(e) => set("vintage", e.target.value)} style={inp} />
      </label>
      <label style={lbl}>Région
        <input name="region" value={form.region} onChange={(e) => set("region", e.target.value)} style={inp} />
      </label>
      <label style={lbl}>Pays
        <input name="country" value={form.country} onChange={(e) => set("country", e.target.value)} style={inp} />
      </label>
      <label style={lbl}>Couleur
        <select name="color" value={form.color} onChange={(e) => set("color", e.target.value)} style={inp}>
          <option value="rouge">Rouge</option><option value="blanc">Blanc</option>
          <option value="rose">Rosé</option><option value="effervescent">Effervescent</option>
        </select>
      </label>
      <label style={lbl}>Cépages
        <input name="grapes" value={form.grapes} onChange={(e) => set("grapes", e.target.value)} style={inp} />
      </label>
      <div style={{ borderTop: "1px dashed var(--line)", paddingTop: "var(--s-3)", display: "grid", gap: "var(--s-3)" }}>
        <label style={lbl}>Quantité
          <input name="quantity" value={form.quantity} inputMode="numeric" onChange={(e) => set("quantity", e.target.value)} style={inp} />
        </label>
        <label style={lbl}>Prix d&apos;achat (€)
          <input name="purchasePrice" value={form.purchasePrice} inputMode="decimal" onChange={(e) => set("purchasePrice", e.target.value)} style={inp} />
        </label>
        <label style={lbl}>Date d&apos;achat
          <input type="date" name="purchaseDate" value={form.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} style={inp} />
        </label>
      </div>
      {state?.error && <p style={{ color: "var(--warn)", fontSize: "var(--t-small)" }}>{state.error}</p>}
      <button disabled={pending} style={btn}>{pending ? "…" : "Enregistrer les modifications"}</button>
      <a href="/cellar" style={{ textAlign: "center", fontSize: "var(--t-small)" }}>Annuler</a>
    </form>
  );
}

const lbl: React.CSSProperties = { display: "grid", gap: 4, fontSize: "var(--t-small)", color: "var(--ink-soft)" };
const inp: React.CSSProperties = { padding: "var(--s-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--card)", fontSize: "var(--t-body)" };
const btn: React.CSSProperties = { padding: "var(--s-3)", border: "none", borderRadius: "var(--radius-pill)", background: "var(--accent)", color: "#fff", fontSize: "var(--t-body)", cursor: "pointer" };
