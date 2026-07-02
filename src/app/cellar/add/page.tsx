"use client";

import { useActionState, useRef, useState } from "react";
import { addBottleAction } from "@/cellar/actions";
import { searchWinesAction } from "./search-action";
import { identifyLabelAction } from "@/cellar/add/identify-action";
import { enrichWineAction } from "@/cellar/add/enrich-action";

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
  const [photoB64, setPhotoB64] = useState("");
  const [enriching, setEnriching] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [drinkFrom, setDrinkFrom] = useState("");
  const [drinkTo, setDrinkTo] = useState("");
  const [marketPriceEur, setMarketPriceEur] = useState("");
  const [form, setForm] = useState({
    producer: "", cuvee: "", vintage: "", region: "", country: "",
    color: "rouge", grapes: "", lwinCode: "", quantity: "1", purchasePrice: "",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onSearch(q: string) {
    set("producer", q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSuggestions(await searchWinesAction(q));
    }, 300);
  }
  function pick(s: Suggestion) {
    if (searchTimer.current) {
      clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
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

  // Merge non-null enrichment into the form WITHOUT overwriting fields the user
  // (or the label read) already filled. Pre-fills purchase price from the found
  // market price, and remembers a product image URL (best-effort).
  function applyEnrichment(en: {
    region: string | null; country: string | null; grapes: string | null;
    description: string | null; priceEur: number | null; imageUrl: string | null;
    drinkFrom: number | null; drinkTo: number | null;
  }) {
    setForm((f) => ({
      ...f,
      region: f.region || (en.region ?? ""),
      country: f.country || (en.country ?? ""),
      grapes: f.grapes || (en.grapes ?? ""),
      purchasePrice: f.purchasePrice || (en.priceEur != null ? String(en.priceEur) : ""),
    }));
    if (en.imageUrl) setImageUrl(en.imageUrl);
    if (en.drinkFrom != null) setDrinkFrom(String(en.drinkFrom));
    if (en.drinkTo != null) setDrinkTo(String(en.drinkTo));
    setMarketPriceEur(en.priceEur != null ? String(en.priceEur) : "");
    setEnrichMsg(en.description || "Infos enrichies depuis le web.");
  }

  // Downscale to a max dimension and re-encode as JPEG so the base64 payload
  // stays small (label OCR doesn't need full res; also faster/cheaper for the model).
  function downscaleToBase64(file: File, maxDim = 1280): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("canvas unsupported"));
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          resolve(dataUrl.split(",")[1] ?? "");
        };
        img.onerror = reject;
        img.src = String(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setIdentifyMsg(null);
    setIdentifying(true);
    try {
      const base64 = await downscaleToBase64(file);
      setPhotoB64(base64);
      const res = await identifyLabelAction(base64, "image/jpeg");
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
      if (e.producer) {
        setEnriching(true);
        try {
          const er = await enrichWineAction(e.producer, e.cuvee, e.vintage ?? null);
          if ("enrichment" in er) applyEnrichment(er.enrichment);
        } finally {
          setEnriching(false);
        }
      }
    } finally {
      setIdentifying(false);
    }
  }

  async function onEnrich() {
    if (form.producer.trim().length < 2) {
      setEnrichMsg("Renseigne au moins le domaine.");
      return;
    }
    setEnriching(true);
    setEnrichMsg(null);
    try {
      const er = await enrichWineAction(
        form.producer,
        form.cuvee || null,
        form.vintage ? Number(form.vintage) : null,
      );
      if ("error" in er) setEnrichMsg(er.error);
      else applyEnrichment(er.enrichment);
    } finally {
      setEnriching(false);
    }
  }

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "var(--s-7) var(--s-5)" }}>
      <h1 style={{ fontSize: "var(--t-h1)" }}>Ajouter une bouteille</h1>
      <div style={{ marginTop: "var(--s-4)", padding: "var(--s-4)", border: "1px dashed var(--line)", borderRadius: "var(--radius)", background: "var(--card)" }}>
        <label style={{ fontSize: "var(--t-small)", color: "var(--ink-soft)", cursor: "pointer" }}>
          📷 {identifying ? "Identification…" : "Photo de l'étiquette (appareil ou galerie)"}
          <input type="file" accept="image/*" disabled={identifying}
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
        <button type="button" onClick={onEnrich} disabled={enriching}
          style={{ padding: "var(--s-2) var(--s-3)", border: "1px solid var(--accent)", borderRadius: "var(--radius-pill)", background: "transparent", color: "var(--accent-deep)", fontSize: "var(--t-small)", cursor: "pointer", justifySelf: "start" }}>
          {enriching ? "Recherche web…" : "🔎 Enrichir depuis le web"}
        </button>
        {enrichMsg && <p style={{ fontSize: "var(--t-meta)", color: "var(--ink-mute)" }}>{enrichMsg}</p>}
        <input type="hidden" name="country" value={form.country} />
        <input type="hidden" name="grapes" value={form.grapes} />
        <input type="hidden" name="lwinCode" value={form.lwinCode} />
        <input type="hidden" name="imageB64" value={photoB64} />
        <input type="hidden" name="imageMime" value="image/jpeg" />
        <input type="hidden" name="imageUrl" value={imageUrl} />
        <input type="hidden" name="drinkFrom" value={drinkFrom} />
        <input type="hidden" name="drinkTo" value={drinkTo} />
        <input type="hidden" name="marketPriceEur" value={marketPriceEur} />
        <div style={{ borderTop: "1px dashed var(--line)", paddingTop: "var(--s-3)", display: "grid", gap: "var(--s-3)" }}>
          <label style={lbl}>Quantité
            <input name="quantity" value={form.quantity} inputMode="numeric"
              onChange={(e) => set("quantity", e.target.value)} style={inp} />
          </label>
          <label style={lbl}>Prix d’achat (€)
            <input name="purchasePrice" value={form.purchasePrice} inputMode="decimal"
              onChange={(e) => set("purchasePrice", e.target.value)} style={inp} />
          </label>
          <p style={{ color: "var(--ink-mute)", fontSize: "var(--t-meta)" }}>Date d’achat : aujourd’hui (auto).</p>
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
