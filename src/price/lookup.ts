// src/price/lookup.ts
// Best-effort market-quote lookup: Tavily search → Mistral JSON extraction.
// Mirrors src/ai/enrich.ts. Returns null (never throws) when keys are missing,
// nothing is found, or the extraction is unusable. fetchFn is injectable for tests.
import { z } from "zod";
import { createTavilySearch } from "@/ai/tavily";
import type { AIConfig } from "@/ai/types";

const looseMoney = z.preprocess((v) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.,]/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return n >= 0.5 && n <= 10_000 ? n : null; // sane bottle-price bounds (EUR)
}, z.number().nullable());

const looseText = z.preprocess((v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}, z.string().nullable());

export const priceEstimateSchema = z
  .object({ estimate: looseMoney, low: looseMoney, high: looseMoney, currency: looseText })
  .transform((r) => {
    // Drop an inconsistent range rather than publish nonsense.
    if (r.low != null && r.high != null && r.low > r.high) return { ...r, low: null, high: null };
    return r;
  });

export type PriceQuote = { estimate: number; low: number | null; high: number | null; currency: string; source: string | null };

export async function lookupPrice(
  wine: { producer: string; cuvee?: string | null; vintage?: number | null },
  config: AIConfig,
  fetchFn: typeof fetch = fetch,
): Promise<PriceQuote | null> {
  const tavilyKey = config.tavilyApiKey;
  const mistralKey = config.mistralApiKey;
  if (!tavilyKey || !mistralKey || !wine.producer) return null;

  try {
    const search = createTavilySearch({ apiKey: tavilyKey, fetchFn });
    const query = ["prix", wine.producer, wine.cuvee ?? "", wine.vintage ?? "", "vin acheter"]
      .filter(Boolean)
      .join(" ");
    const results = await search(query, 5);
    if (results.length === 0) return null;

    const context = results
      .map((r) => `${r.title}\n${r.url}\n${r.content}`)
      .join("\n\n")
      .slice(0, 6000);

    const model = process.env.MISTRAL_MODEL || "pixtral-12b-latest";
    const res = await fetchFn("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${mistralKey}` },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content:
              "À partir de ces extraits web, estime le prix de marché actuel d'UNE bouteille de ce vin, en euros. " +
              "Renvoie UNIQUEMENT un JSON {estimate (nombre, prix typique), low (nombre, bas de fourchette), " +
              "high (nombre, haut de fourchette), currency (\"EUR\")}. Mets null pour toute valeur inconnue.\n\nExtraits:\n" +
              context,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content;
    if (!text) return null;
    const parsed = priceEstimateSchema.parse(JSON.parse(text));
    if (parsed.estimate == null) return null;

    let source: string | null = null;
    try {
      source = new URL(results[0].url).hostname;
    } catch {
      source = null;
    }
    return { estimate: parsed.estimate, low: parsed.low, high: parsed.high, currency: parsed.currency ?? "EUR", source };
  } catch (e) {
    console.error("[price] lookup failed", e);
    return null;
  }
}
