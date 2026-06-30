import { eq } from "drizzle-orm";
import { db } from "@/db";
import { wineImages } from "@/db/schema";

export async function setWineImage(wineId: string, base64: string, mime: string): Promise<void> {
  await db
    .insert(wineImages)
    .values({ wineId, data: base64, mime })
    .onConflictDoUpdate({ target: wineImages.wineId, set: { data: base64, mime } });
}

export async function getWineImage(wineId: string): Promise<{ data: string; mime: string } | null> {
  const r = (await db
    .select({ data: wineImages.data, mime: wineImages.mime })
    .from(wineImages)
    .where(eq(wineImages.wineId, wineId))
    .limit(1))[0];
  return r ?? null;
}
