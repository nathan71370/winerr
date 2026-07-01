import { wineEnrichmentSchema, type WineEnrichment } from "./enrich-types";
import { createTavilySearch } from "./tavily";

// Best-effort web enrichment: Tavily search → Mistral JSON extraction. Returns
// null (never throws) when keys are missing or nothing usable is found.
export async function enrichWine(input: {
  producer: string;
  cuvee?: string | null;
  vintage?: number | null;
}): Promise<WineEnrichment | null> {
  const tavilyKey = process.env.TAVILY_API_KEY;
  const mistralKey = process.env.MISTRAL_API_KEY;
  if (!tavilyKey || !mistralKey || !input.producer) return null;

  try {
    const search = createTavilySearch({ apiKey: tavilyKey });
    const query = [input.producer, input.cuvee ?? "", input.vintage ?? "", "vin région cépages prix"]
      .filter(Boolean)
      .join(" ");
    const results = await search(query, 5);
    if (results.length === 0) return null;

    const context = results
      .map((r) => `${r.title}\n${r.url}\n${r.content}`)
      .join("\n\n")
      .slice(0, 6000);

    const model = process.env.MISTRAL_MODEL || "pixtral-12b-latest";
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${mistralKey}` },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content:
              "À partir de ces extraits web sur un vin, renvoie UNIQUEMENT un JSON avec les clés " +
              "{region, country, grapes, description (2 phrases max), drinkFrom (année en nombre), " +
              "drinkTo (année en nombre), priceEur (nombre, prix indicatif en euros), imageUrl (URL d'une image du produit)}. " +
              "Mets null pour toute valeur inconnue.\n\nExtraits:\n" +
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
    const enrichment = wineEnrichmentSchema.parse(JSON.parse(text));
    // Prefer a real product image from the top results' og:image tags (the LLM's
    // imageUrl is unreliable). Overrides the LLM imageUrl when found.
    const { firstOgImage } = await import("./og-image");
    const og = await firstOgImage(results.slice(0, 3).map((r) => r.url).filter(Boolean));
    if (og) enrichment.imageUrl = og;
    return enrichment;
  } catch (e) {
    console.error("[enrich] failed", e);
    return null;
  }
}
