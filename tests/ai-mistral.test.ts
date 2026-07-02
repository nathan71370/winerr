import { describe, it, expect, vi } from "vitest";
import { createMistralProvider } from "@/ai/mistral";

function fakeFetch(payload: unknown, ok = true, status = 200) {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      ({ ok, status, json: async () => payload }) as unknown as Response,
  );
}

const MISTRAL_ENDPOINT = "https://api.mistral.ai/v1/chat/completions";

const labelPayload = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          producer: "Château Margaux",
          cuvee: null,
          vintage: 2015,
          region: "Margaux",
          country: "France",
          color: "rouge",
          grapes: "Cabernet Sauvignon",
          confidence: 0.9,
        }),
      },
    },
  ],
};

describe("createMistralProvider.identifyLabel", () => {
  it("posts to the Mistral endpoint, sends Bearer auth, includes image part, and parses the response", async () => {
    const fetchFn = fakeFetch(labelPayload);
    const p = createMistralProvider({ apiKey: "MKEY123", fetchFn });
    const out = await p.identifyLabel("BASE64DATA", "image/jpeg");

    expect(out.producer).toBe("Château Margaux");
    expect(out.vintage).toBe(2015);

    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toBe(MISTRAL_ENDPOINT);

    const headers = init!.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer MKEY123");

    const body = JSON.parse(init!.body as string);
    const userContent: { type: string; image_url?: string }[] =
      body.messages[0].content;
    const imagePart = userContent.find((p) => p.type === "image_url");
    expect(imagePart).toBeDefined();
    expect(imagePart?.image_url).toContain("data:image/jpeg;base64,BASE64DATA");
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("uses the default pixtral model when no model is specified", async () => {
    const fetchFn = fakeFetch(labelPayload);
    const p = createMistralProvider({ apiKey: "K", fetchFn });
    await p.identifyLabel("x", "image/jpeg");
    const body = JSON.parse(
      fetchFn.mock.calls[0][1]!.body as string,
    );
    expect(body.model).toBe("pixtral-12b-latest");
  });

  it("uses a custom model when specified", async () => {
    const fetchFn = fakeFetch(labelPayload);
    const p = createMistralProvider({
      apiKey: "K",
      model: "mistral-small-latest",
      fetchFn,
    });
    await p.identifyLabel("x", "image/jpeg");
    const body = JSON.parse(
      fetchFn.mock.calls[0][1]!.body as string,
    );
    expect(body.model).toBe("mistral-small-latest");
  });

  it("throws on a non-ok response with maxRetries: 0", async () => {
    const p = createMistralProvider({
      apiKey: "K",
      fetchFn: fakeFetch({}, false, 401),
      maxRetries: 0,
    });
    await expect(p.identifyLabel("x", "image/jpeg")).rejects.toThrow(
      "Mistral error 401",
    );
  });

  it("retries a 429 then succeeds on the second call", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({}),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => labelPayload,
      } as unknown as Response);
    const p = createMistralProvider({
      apiKey: "K",
      fetchFn,
      maxRetries: 2,
      retryDelayMs: 0,
    });
    const out = await p.identifyLabel("x", "image/jpeg");
    expect(out.producer).toBe("Château Margaux");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("retries a 503 then succeeds", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({}),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => labelPayload,
      } as unknown as Response);
    const p = createMistralProvider({
      apiKey: "K",
      fetchFn,
      maxRetries: 2,
      retryDelayMs: 0,
    });
    const out = await p.identifyLabel("x", "image/jpeg");
    expect(out.producer).toBe("Château Margaux");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe("createMistralProvider.estimateDrinkWindow", () => {
  it("returns a parsed drink window", async () => {
    const payload = {
      choices: [
        {
          message: {
            content: JSON.stringify({ from: 2026, to: 2035, confidence: 0.8 }),
          },
        },
      ],
    };
    const p = createMistralProvider({ apiKey: "K", fetchFn: fakeFetch(payload) });
    const w = await p.estimateDrinkWindow({
      producer: "Château Margaux",
      cuvee: null,
      vintage: 2015,
      region: "Margaux",
      color: "rouge",
      grapes: "Cabernet Sauvignon",
    });
    expect(w).toEqual({ from: 2026, to: 2035, confidence: 0.8 });
  });

  it("sends a text-only message for estimateDrinkWindow", async () => {
    const payload = {
      choices: [
        {
          message: {
            content: JSON.stringify({ from: 2026, to: 2035, confidence: 0.8 }),
          },
        },
      ],
    };
    const fetchFn = fakeFetch(payload);
    const p = createMistralProvider({ apiKey: "K", fetchFn });
    await p.estimateDrinkWindow({
      producer: "X",
      cuvee: null,
      vintage: 2020,
      region: "Bordeaux",
      color: "rouge",
      grapes: null,
    });
    const body = JSON.parse(
      fetchFn.mock.calls[0][1]!.body as string,
    );
    // Should be a single string message, not a content array with image parts
    const content = body.messages[0].content;
    expect(typeof content).toBe("string");
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("throws on a non-ok response with maxRetries: 0", async () => {
    const p = createMistralProvider({
      apiKey: "K",
      fetchFn: fakeFetch({}, false, 403),
      maxRetries: 0,
    });
    await expect(
      p.estimateDrinkWindow({
        producer: "X",
        cuvee: null,
        vintage: 2020,
        region: "Bordeaux",
        color: "rouge",
        grapes: null,
      }),
    ).rejects.toThrow("Mistral error 403");
  });
});
