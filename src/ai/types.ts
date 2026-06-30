import { z } from "zod";

const COLORS = ["rouge", "blanc", "rose", "effervescent"] as const;

// LLM text fields: arrays → joined, blank → null, non-string → String, missing → null.
const looseText = z.preprocess((v) => {
  if (v == null) return null;
  if (Array.isArray(v)) {
    const s = v.filter(Boolean).map(String).join(", ");
    return s || null;
  }
  if (typeof v === "string") return v.trim() || null;
  return String(v);
}, z.string().nullable());

// LLM integer fields: coerce numeric strings; blank/missing/unparseable → null.
const looseIntNullable = z.preprocess((v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}, z.number().int().nullable());

// Color: keep only a valid enum value (case-insensitive); anything else → null.
const looseColor = z.preprocess((v) => {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return (COLORS as readonly string[]).includes(s) ? s : null;
}, z.enum(COLORS).nullable());

// Confidence: coerce; treat >1 as a percentage; clamp to [0,1]; default 0.5.
const looseConfidence = z.preprocess((v) => {
  let n = Number(v);
  if (!Number.isFinite(n)) return 0.5;
  if (n > 1) n = n / 100;
  return Math.min(1, Math.max(0, n));
}, z.number());

// Drink-window year: coerce numeric strings; leave null/empty/unparseable so the
// parse fails (a window with no real years is useless and is skipped upstream).
const looseYear = z.preprocess((v) => {
  if (v == null || v === "") return v;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : v;
}, z.number().int());

export const labelExtractionSchema = z.object({
  producer: looseText,
  cuvee: looseText,
  vintage: looseIntNullable,
  region: looseText,
  country: looseText,
  color: looseColor,
  grapes: looseText,
  confidence: looseConfidence,
});
export type LabelExtraction = z.infer<typeof labelExtractionSchema>;

export const drinkWindowSchema = z.object({
  from: looseYear,
  to: looseYear,
  confidence: looseConfidence,
});
export type DrinkWindow = z.infer<typeof drinkWindowSchema>;

export type WineForWindow = {
  producer: string | null;
  cuvee: string | null;
  vintage: number | null;
  region: string | null;
  color: string | null;
  grapes: string | null;
};

export interface AIProvider {
  identifyLabel(imageBase64: string, mimeType: string): Promise<LabelExtraction>;
  estimateDrinkWindow(wine: WineForWindow): Promise<DrinkWindow | null>;
}
