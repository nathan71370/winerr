type FetchFn = typeof fetch;

// Fetch a page and extract its og:image (or twitter:image) as an absolute https
// URL. SSRF-hardened: https-only, no redirects, 6s timeout, capped read. Returns
// null on any failure (best-effort).
export async function fetchOgImage(pageUrl: string, fetchFn: FetchFn = fetch): Promise<string | null> {
  try {
    const u = new URL(pageUrl);
    if (u.protocol !== "https:") return null;
    const res = await fetchFn(pageUrl, {
      redirect: "error",
      signal: AbortSignal.timeout(6_000),
      headers: { accept: "text/html" },
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 500_000);
    const m =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    if (!m) return null;
    const abs = new URL(m[1], pageUrl);
    return abs.protocol === "https:" ? abs.toString() : null;
  } catch {
    return null;
  }
}

// First og:image found across the given page URLs.
export async function firstOgImage(urls: string[], fetchFn: FetchFn = fetch): Promise<string | null> {
  for (const url of urls) {
    const img = await fetchOgImage(url, fetchFn);
    if (img) return img;
  }
  return null;
}
