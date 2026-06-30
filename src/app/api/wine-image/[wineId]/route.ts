import { getWineImage } from "@/images/store";

const PLACEHOLDER = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export async function GET(_req: Request, ctx: { params: Promise<{ wineId: string }> }) {
  const { wineId } = await ctx.params;
  const img = await getWineImage(wineId).catch(() => null);
  if (!img) {
    return new Response(PLACEHOLDER, {
      headers: { "content-type": "image/png", "cache-control": "no-store" },
    });
  }
  return new Response(Buffer.from(img.data, "base64"), {
    headers: { "content-type": img.mime, "cache-control": "public, max-age=300" },
  });
}
