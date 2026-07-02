import { describe, it, expect, vi } from "vitest";
import { createGeminiProvider } from "@/ai/gemini";

function fakeFetch(payload: unknown, ok = true, status = 200) {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      ({ ok, status, json: async () => payload }) as unknown as Response,
  );
}

const labelPayload = {
  candidates: [{ content: { parts: [{ text: JSON.stringify({
    producer: "Château Margaux", cuvee: null, vintage: 2015, region: "Margaux",
    country: "France", color: "rouge", grapes: "Cabernet Sauvignon", confidence: 0.9,
  }) }] } }],
};

describe("createGeminiProvider.identifyLabel", () => {
  it("posts to the model endpoint with the api key and parses the JSON candidate", async () => {
    const fetchFn = fakeFetch(labelPayload);
    const p = createGeminiProvider({ apiKey: "KEY123", model: "gemini-2.0-flash", fetchFn });
    const out = await p.identifyLabel("BASE64DATA", "image/jpeg");
    expect(out.producer).toBe("Château Margaux");
    expect(out.vintage).toBe(2015);
    const url = String(fetchFn.mock.calls[0][0]);
    expect(url).toContain("gemini-2.0-flash:generateContent");
    expect(url).toContain("key=KEY123");
    const body = JSON.parse(fetchFn.mock.calls[0][1]!.body as string);
    expect(body.contents[0].parts.some((pt: { inlineData?: unknown }) => pt.inlineData)).toBe(true);
  });

  it("throws on a non-ok response (no retries)", async () => {
    const p = createGeminiProvider({ apiKey: "K", fetchFn: fakeFetch({}, false, 429), maxRetries: 0 });
    await expect(p.identifyLabel("x", "image/jpeg")).rejects.toThrow();
  });

  it("retries a 429 then succeeds", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => labelPayload } as unknown as Response);
    const p = createGeminiProvider({ apiKey: "K", fetchFn, maxRetries: 2, retryDelayMs: 0 });
    const out = await p.identifyLabel("x", "image/jpeg");
    expect(out.producer).toBe("Château Margaux");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});

describe("createGeminiProvider.estimateDrinkWindow", () => {
  it("returns a parsed window", async () => {
    const payload = { candidates: [{ content: { parts: [{ text: JSON.stringify({ from: 2026, to: 2032, confidence: 0.7 }) }] } }] };
    const p = createGeminiProvider({ apiKey: "K", fetchFn: fakeFetch(payload) });
    const w = await p.estimateDrinkWindow({ producer: "X", cuvee: null, vintage: 2015, region: "Margaux", color: "rouge", grapes: null });
    expect(w).toEqual({ from: 2026, to: 2032, confidence: 0.7 });
  });
});
