import { z } from "zod";

const looseText = z.preprocess((v) => {
  if (v == null) return null;
  if (Array.isArray(v)) { const s = v.filter(Boolean).map(String).join(", "); return s || null; }
  if (typeof v === "string") return v.trim() || null;
  return String(v);
}, z.string().nullable());

const looseInt = z.preprocess((v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}, z.number().int().nullable());

const looseFloat = z.preprocess((v) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.,]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}, z.number().nullable());

export const wineEnrichmentSchema = z.object({
  region: looseText,
  country: looseText,
  grapes: looseText,
  description: looseText,
  drinkFrom: looseInt,
  drinkTo: looseInt,
  priceEur: looseFloat,
  imageUrl: looseText,
});
export type WineEnrichment = z.infer<typeof wineEnrichmentSchema>;
