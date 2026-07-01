import {
  labelExtractionSchema,
  drinkWindowSchema,
  type AIProvider,
  type WineForWindow,
} from "./types";

const ENDPOINT = "https://api.mistral.ai/v1/chat/completions";
type FetchFn = typeof fetch;

export function createMistralProvider(opts: {
  apiKey: string;
  model?: string;
  fetchFn?: FetchFn;
  maxRetries?: number;
  retryDelayMs?: number;
}): AIProvider {
  const model = opts.model ?? "pixtral-12b-latest";
  const doFetch = opts.fetchFn ?? fetch;
  const maxRetries = opts.maxRetries ?? 2;
  const retryDelayMs = opts.retryDelayMs ?? 1500;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function call(body: unknown): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      const res = await doFetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const text = json.choices?.[0]?.message?.content;
        if (!text) throw new Error("Mistral: empty response");
        return JSON.parse(text);
      }
      if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
      throw new Error(`Mistral error ${res.status}`);
    }
  }

  return {
    async identifyLabel(imageBase64: string, mimeType: string) {
      const raw = await call({
        model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Identifie ce vin à partir de la photo d'étiquette. " +
                  "Réponds en JSON avec les champs : producer (domaine/producteur), cuvee (nom de la cuvée), " +
                  "vintage (millésime en nombre entier), region, country, " +
                  "color parmi rouge|blanc|rose|effervescent, grapes (cépages), " +
                  "et confidence entre 0 et 1. Mets null pour tout champ inconnu.",
              },
              {
                type: "image_url",
                image_url: `data:${mimeType};base64,${imageBase64}`,
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
      });
      return labelExtractionSchema.parse(raw);
    },

    async estimateDrinkWindow(wine: WineForWindow) {
      const raw = await call({
        model,
        messages: [
          {
            role: "user",
            content:
              "Estime la fenêtre de dégustation optimale (en années) pour ce vin, " +
              "en raisonnant par cépage, région et millésime. " +
              "Réponds en JSON avec les champs : from (année de début), to (année de fin), confidence entre 0 et 1.\n" +
              "Vin : " +
              JSON.stringify(wine),
          },
        ],
        response_format: { type: "json_object" },
      });
      const parsed = drinkWindowSchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    },
  };
}
