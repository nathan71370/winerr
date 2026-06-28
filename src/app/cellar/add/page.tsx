"use client";

import { useActionState, useState } from "react";
import { addBottleAction } from "@/cellar/actions";
import { searchWinesAction } from "./search-action";
import { identifyLabelAction } from "@/cellar/add/identify-action";

type Suggestion = {
  lwin: string; displayName: string | null; producer: string | null;
  wine: string | null; region: string | null; country: string | null; colour: string | null;
};

const colourToColor: Record<string, string> = {
  Red: "rouge", White: "blanc", "Rosé": "rose", Rose: "rose", Sparkling: "effervescent",
};

export default function AddBottlePage() {
  const [state, action, pending] = useActionState(addBottleAction, null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [identifying, setIdentifying] = useState(false);
  const [identifyMsg, setIdentifyMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    producer: "", cuvee: "", vintage: "", region: "", country: "",
    color: "rouge", grapes: "", lwinCode: "", quantity: "1", purchasePrice: "",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function onSearch(q: string) {
    set("producer", q);
    setSuggestions(q.trim().length >= 2 ? await searchWinesAction(q) : []);
  }
  function pick(s: Suggestion) {
    setForm((f) => ({
      ...f,
      producer: s.producer ?? s.displayName ?? "",
      cuvee: s.wine ?? "",
      region: s.region ?? "",
      country: s.country ?? "",
      color: colourToColor[s.colour ?? ""] ?? "rouge",
      lwinCode: s.lwin,
    }));
    setSuggestions([]);
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setIdentifyMsg(null);
    setIdentifying(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await identifyLabelAction(base64, file.type);
      if ("error" in res) {
        setIdentifyMsg(res.error);
        return;
      }
      const e = res.extraction;
      setForm((f) => ({
        ...f,
        producer: e.producer ?? f.producer,
        cuvee: e.cuvee ?? "",
        vintage: e.vintage != null ? String(e.vintage) : "",
        region: e.region ?? "",
        country: e.country ?? "",
        color: e.color ?? "rouge",
        grapes: e.grapes ?? "",
        lwinCode: "",
      }));
      setSuggestions([]);
      setIdentifyMsg(`Identifié (confiance ${(e.confidence * 100).toFixed(0)} %) — vérifie et corrige si besoin.`);
    } finally {
      setIdentifying(false);
    }
  }

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "var(--s-7) var(--s-5)" }}>
      <h1 style={{ fontSize: "var(--t-h1)" }}>Ajouter une bouteille</h1>
      <div style={{ marginTop: "var(--s-4)", padding: "var(--s-4)", border: "1px dashed var(--line)", borderRadius: "var(--radius)", background: "var(--card)" }}>
        <label style={{ fontSize: "var(--t-small)", color: "var(--ink-soft)", cursor: "pointer" }}>
          📷 {identifying ? "Identification…" : "Photographier l'étiquette"}
          <input type="file" accept="image/*" capture="environment" disabled={identifying}
            onChange={(ev) => onPhoto(ev.target.files?.[0])} style={{ display: "block", marginTop: "var(--s-2)", fontSize: "var(--t-small)" }} />
        </label>
        {identifyMsg && <p style={{ marginTop: "var(--s-2)", fontSize: "var(--t-meta)", color: "var(--ink-mute)" }}>{identifyMsg}</p>}
      </div>
      <form action={action} style={{ display: "grid", gap: "var(--s-3)", marginTop: "var(--s-6)" }}>
        <label style={lbl}>Domaine
          <input name="producer" value={form.producer} required autoComplete="off"
            onChange={(e) => onSearch(e.target.value)} style={inp} />
        </label>
        {suggestions.length > 0 && (
          <div style={sugBox}>
            {suggestions.map((s) => (
              <button type="button" key={s.lwin} onClick={() => pick(s)} style={sugItem}>
                {s.displayName ?? s.producer} {s.region ? `· ${s.region}` : ""}
              </button>
            ))}
          </div>
        )}
        <label style={lbl}>Cuvée
          <input name="cuvee" value={form.cuvee} onChange={(e) => set("cuvee", e.target.value)} style={inp} />
        </label>
        <label style={lbl}>Millésime
          <input name="vintage" value={form.vintage} inputMode="numeric"
            onChange={(e) => set("vintage", e.target.value)} style={inp} />
        </label>
        <label style={lbl}>Région
          <input name="region" value={form.region} onChange={(e) => set("region", e.target.value)} style={inp} />
        </label>
        <label style={lbl}>Couleur
          <select name="color" value={form.color} onChange={(e) => set("color", e.target.value)} style={inp}>
            <option value="rouge">Rouge</option><option value="blanc">Blanc</option>
            <option value="rose">Rosé</option><option value="effervescent">Effervescent</option>
          </select>
        </label>
        <input type="hidden" name="country" value={form.country} />
        <input type="hidden" name="grapes" value={form.grapes} />
        <input type="hidden" name="lwinCode" value={form.lwinCode} />
        <div style={{ borderTop: "1px dashed var(--line)", paddingTop: "var(--s-3)", display: "grid", gap: "var(--s-3)" }}>
          <label style={lbl}>Quantité
            <input name="quantity" value={form.quantity} inputMode="numeric"
              onChange={(e) => set("quantity", e.target.value)} style={inp} />
          </label>
          <label style={lbl}>Prix d'achat (€)
            <input name="purchasePrice" value={form.purchasePrice} inputMode="decimal"
              onChange={(e) => set("purchasePrice", e.target.value)} style={inp} />
          </label>
          <p style={{ color: "var(--ink-mute)", fontSize: "var(--t-meta)" }}>Date d'achat : aujourd'hui (auto).</p>
        </div>
        {state?.error && <p style={{ color: "var(--warn)", fontSize: "var(--t-small)" }}>{state.error}</p>}
        <button disabled={pending} style={btn}>{pending ? "…" : "Ajouter à ma cave"}</button>
        <a href="/cellar" style={{ textAlign: "center", fontSize: "var(--t-small)" }}>Annuler</a>
      </form>
    </main>
  );
}

const lbl: React.CSSProperties = { display: "grid", gap: 4, fontSize: "var(--t-small)", color: "var(--ink-soft)" };
const inp: React.CSSProperties = { padding: "var(--s-3)", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--card)", fontSize: "var(--t-body)" };
const btn: React.CSSProperties = { padding: "var(--s-3)", border: "none", borderRadius: "var(--radius-pill)", background: "var(--accent)", color: "#fff", fontSize: "var(--t-body)", cursor: "pointer" };
const sugBox: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "var(--card)", overflow: "hidden" };
const sugItem: React.CSSProperties = { display: "block", width: "100%", textAlign: "left", padding: "var(--s-2) var(--s-3)", border: "none", borderBottom: "1px solid var(--line)", background: "transparent", cursor: "pointer", fontSize: "var(--t-small)" };
