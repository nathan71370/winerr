type FetchFn = typeof fetch;
export type TavilyResult = { title: string; url: string; content: string };

export function createTavilySearch(opts: { apiKey: string; fetchFn?: FetchFn }) {
  const doFetch = opts.fetchFn ?? fetch;
  return async function search(query: string, maxResults = 5): Promise<TavilyResult[]> {
    const res = await doFetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: opts.apiKey,
        query,
        max_results: maxResults,
        search_depth: "basic",
      }),
    });
    if (!res.ok) throw new Error(`Tavily error ${res.status}`);
    const json = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
    return (json.results ?? []).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      content: r.content ?? "",
    }));
  };
}
