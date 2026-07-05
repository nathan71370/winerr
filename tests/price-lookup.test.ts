import { describe, it, expect } from "vitest";
import { priceEstimateSchema, lookupPrice } from "@/price/lookup";
import type { AIConfig } from "@/ai/types";

describe("priceEstimateSchema", () => {
  it("coerces French decimal strings and nulls unknowns", () => {
    const r = priceEstimateSchema.parse({ estimate: "18,50", low: null, high: "22 €", currency: null });
    expect(r).toEqual({ estimate: 18.5, low: null, high: 22, currency: null });
  });
  it("nulls an absurd estimate and an inconsistent range", () => {
    expect(priceEstimateSchema.parse({ estimate: 50000, low: null, high: null, currency: "EUR" }).estimate).toBeNull();
    const r = priceEstimateSchema.parse({ estimate: 18, low: 25, high: 12, currency: "EUR" });
    expect(r.low).toBeNull();
    expect(r.high).toBeNull();
  });
});

function fetchStub(tavilyBody: unknown, mistralContent: string | null): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("tavily")) {
      return new Response(JSON.stringify(tavilyBody), { status: 200 });
    }
    if (mistralContent === null) return new Response("oops", { status: 500 });
    return new Response(
      JSON.stringify({ choices: [{ message: { content: mistralContent } }] }),
      { status: 200 },
    );
  }) as typeof fetch;
}

const wine = { producer: "Léoni", cuvee: null, vintage: 2019 };
const tavilyOk = { results: [{ title: "Léoni 2019", url: "https://www.idealwine.com/x", content: "18,50 €" }] };
const config: AIConfig = { provider: "mistral", tavilyApiKey: "t", mistralApiKey: "m" };

describe("lookupPrice", () => {
  it("returns the parsed estimate with the top result's host as source", async () => {
    const q = await lookupPrice(wine, config, fetchStub(tavilyOk, JSON.stringify({ estimate: "18,50", low: 14, high: 22, currency: "EUR" })));
    expect(q).toEqual({ estimate: 18.5, low: 14, high: 22, currency: "EUR", source: "www.idealwine.com" });
  });
  it("returns null when Tavily finds nothing", async () => {
    expect(await lookupPrice(wine, config, fetchStub({ results: [] }, "{}"))).toBeNull();
  });
  it("returns null on Mistral failure or garbage", async () => {
    expect(await lookupPrice(wine, config, fetchStub(tavilyOk, null))).toBeNull();
    expect(await lookupPrice(wine, config, fetchStub(tavilyOk, "not json"))).toBeNull();
    expect(await lookupPrice(wine, config, fetchStub(tavilyOk, JSON.stringify({ estimate: null })))).toBeNull();
  });
  it("returns null without API keys", async () => {
    const noKeys: AIConfig = { provider: "mistral", tavilyApiKey: null, mistralApiKey: "m" };
    expect(await lookupPrice(wine, noKeys, fetchStub(tavilyOk, "{}"))).toBeNull();
  });
});
