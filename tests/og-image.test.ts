import { describe, it, expect, vi } from "vitest";
import { fetchOgImage, firstOgImage } from "@/ai/og-image";

const htmlWith = (img: string) =>
  `<html><head><meta property="og:image" content="${img}"></head></html>`;
function fakeFetch(body: string, ok = true, status = 200) {
  return vi.fn(async () => ({ ok, status, text: async () => body }) as unknown as Response);
}

describe("fetchOgImage", () => {
  it("extracts an absolute og:image from a https page", async () => {
    const f = fakeFetch(htmlWith("https://cdn.x/bottle.jpg"));
    expect(await fetchOgImage("https://shop.example/wine", f)).toBe("https://cdn.x/bottle.jpg");
  });
  it("resolves a relative og:image against the page URL", async () => {
    const f = fakeFetch(htmlWith("/img/bottle.jpg"));
    expect(await fetchOgImage("https://shop.example/wine", f)).toBe("https://shop.example/img/bottle.jpg");
  });
  it("rejects a non-https page without fetching", async () => {
    const f = fakeFetch(htmlWith("https://cdn.x/b.jpg"));
    expect(await fetchOgImage("http://shop.example/wine", f)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it("returns null when there is no og:image", async () => {
    expect(await fetchOgImage("https://x/y", fakeFetch("<html></html>"))).toBeNull();
  });
  it("firstOgImage returns the first hit", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "<html></html>" } as unknown as Response)
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => htmlWith("https://cdn.x/2.jpg") } as unknown as Response);
    expect(await firstOgImage(["https://a", "https://b"], f)).toBe("https://cdn.x/2.jpg");
  });
});
