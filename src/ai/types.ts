import { z } from "zod";

export const labelExtractionSchema = z.object({
  producer: z.string().nullable().optional().default(null),
  cuvee: z.string().nullable().optional().default(null),
  vintage: z.number().int().nullable().optional().default(null),
  region: z.string().nullable().optional().default(null),
  country: z.string().nullable().optional().default(null),
  color: z.enum(["rouge", "blanc", "rose", "effervescent"]).nullable().optional().default(null),
  grapes: z.string().nullable().optional().default(null),
  confidence: z.number().min(0).max(1),
});
export type LabelExtraction = z.infer<typeof labelExtractionSchema>;

export const drinkWindowSchema = z.object({
  from: z.number().int(),
  to: z.number().int(),
  confidence: z.number().min(0).max(1),
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
