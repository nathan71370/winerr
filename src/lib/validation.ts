import { z } from "zod";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export const addBottleSchema = z.object({
  // wine fields
  producer: z.string().min(1),
  cuvee: z.preprocess(emptyToUndefined, z.string().optional()),
  vintage: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1800).max(2100).optional()),
  region: z.preprocess(emptyToUndefined, z.string().optional()),
  country: z.preprocess(emptyToUndefined, z.string().optional()),
  color: z.enum(["rouge", "blanc", "rose", "effervescent"]),
  grapes: z.preprocess(emptyToUndefined, z.string().optional()),
  lwinCode: z.preprocess(emptyToUndefined, z.string().optional()),
  // bottle fields
  quantity: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).default(1)),
  purchasePrice: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  // Best-effort AI-extracted market price: an out-of-range/garbage value must
  // NOT fail the whole form — it just gets dropped (catch → undefined).
  marketPriceEur: z.preprocess(emptyToUndefined, z.coerce.number().min(0.5).max(10000).optional().catch(undefined)),
});

export type AddBottleInput = z.infer<typeof addBottleSchema>;

export const updateBottleSchema = addBottleSchema.extend({
  itemId: z.string().min(1),
  purchaseDate: z.preprocess(emptyToUndefined, z.string().optional()),
});
export type UpdateBottleInput = z.infer<typeof updateBottleSchema>;

export const unitSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["grid", "diamond"]),
  cols: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(20)),
  rows: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(20)),
  gridX: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).default(0)),
  gridY: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).default(0)),
});
export type UnitInput = z.infer<typeof unitSchema>;

export const placeSchema = z.object({
  cellarItemId: z.string().min(1),
  unitId: z.string().min(1),
  compartment: z.string().min(1),
  quantity: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1)),
});
export type PlaceInput = z.infer<typeof placeSchema>;

export const unplaceSchema = z.object({
  placementId: z.string().min(1),
  quantity: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).optional()),
});
export type UnplaceInput = z.infer<typeof unplaceSchema>;

export const settingsSchema = z.object({
  aiProvider: z.enum(["mistral", "gemini"]),
  mistralApiKey: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
  geminiApiKey: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
  tavilyApiKey: z.preprocess(emptyToUndefined, z.string().max(200).optional()),
  clearMistral: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  clearGemini: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  clearTavily: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
});
export type SettingsInput = z.infer<typeof settingsSchema>;
