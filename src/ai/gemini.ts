import {
  labelExtractionSchema,
  drinkWindowSchema,
  type AIProvider,
  type WineForWindow,
} from "./types";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
type FetchFn = typeof fetch;

const LABEL_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    producer: { type: "string", nullable: true },
    cuvee: { type: "string", nullable: true },
    vintage: { type: "integer", nullable: true },
    region: { type: "string", nullable: true },
    country: { type: "string", nullable: true },
    color: { type: "string", enum: ["rouge", "blanc", "rose", "effervescent"], nullable: true },
    grapes: { type: "string", nullable: true },
    confidence: { type: "number" },
  },
  required: ["confidence"],
};

const WINDOW_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    from: { type: "integer" },
    to: { type: "integer" },
    confidence: { type: "number" },
  },
  required: ["from", "to", "confidence"],
};

export function createGeminiProvider(opts: {
  apiKey: string;
  model?: string;
  fetchFn?: FetchFn;
  maxRetries?: number;
  retryDelayMs?: number;
}): AIProvider {
  const model = opts.model ?? "gemini-2.0-flash";
  const doFetch = opts.fetchFn ?? fetch;
  const maxRetries = opts.maxRetries ?? 2;
  const retryDelayMs = opts.retryDelayMs ?? 1500;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function call(body: unknown): Promise<unknown> {
    // Retry transient errors (429 rate-limit, 503 overloaded) with linear
    // backoff. Exhausted free-tier daily quota still 429s past the retries.
    for (let attempt = 0; ; attempt++) {
      const res = await doFetch(`${ENDPOINT}/${model}:generateContent?key=${opts.apiKey}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("Gemini: empty response");
        return JSON.parse(text);
      }
      if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
      throw new Error(`Gemini error ${res.status}`);
    }
  }

  return {
    async identifyLabel(imageBase64, mimeType) {
      const raw = await call({
        contents: [
          {
            parts: [
              {
                text:
                  "Identifie ce vin à partir de la photo d'étiquette. Renvoie producer (domaine), cuvee, vintage (année en nombre), region, country, color parmi rouge|blanc|rose|effervescent, grapes (cépages), et confidence entre 0 et 1. Mets null pour tout champ inconnu.",
              },
              { inlineData: { mimeType, data: imageBase64 } },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: LABEL_RESPONSE_SCHEMA,
        },
      });
      return labelExtractionSchema.parse(raw);
    },

    async estimateDrinkWindow(wine: WineForWindow) {
      const raw = await call({
        contents: [
          {
            parts: [
              {
                text:
                  "Estime la fenêtre de dégustation optimale (en années) pour ce vin, en raisonnant par cépage, région et millésime. Renvoie from (année), to (année), confidence entre 0 et 1.\nVin: " +
                  JSON.stringify(wine),
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: WINDOW_RESPONSE_SCHEMA,
        },
      });
      const parsed = drinkWindowSchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    },
  };
}
