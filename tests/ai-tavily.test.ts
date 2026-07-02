import { describe, it, expect, vi } from "vitest";
import { createTavilySearch } from "@/ai/tavily";

function fakeFetch(payload: unknown, ok = true, status = 200) {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      ({ ok, status, json: async () => payload }) as unknown as Response,
  );
}

describe("createTavilySearch", () => {
  it("posts the query + api key and returns results", async () => {
    const fetchFn = fakeFetch({ results: [{ title: "T", url: "https://u", content: "C" }] });
    const search = createTavilySearch({ apiKey: "TKEY", fetchFn });
    const out = await search("Bourgueil Les Perrières 2021", 5);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ title: "T", url: "https://u", content: "C" });
    const url = String(fetchFn.mock.calls[0][0]);
    expect(url).toContain("api.tavily.com/search");
    const body = JSON.parse(fetchFn.mock.calls[0][1]!.body as string);
    expect(body.api_key).toBe("TKEY");
    expect(body.query).toContain("Bourgueil");
    expect(body.max_results).toBe(5);
  });
  it("throws on a non-ok response", async () => {
    const search = createTavilySearch({ apiKey: "K", fetchFn: fakeFetch({}, false, 401) });
    await expect(search("x")).rejects.toThrow();
  });
});
