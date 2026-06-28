"use server";

import { db } from "@/db";
import { reviews } from "@/db/schema";
import { auth } from "@/auth/config";
import { snapRating } from "@/reviews/rating";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function requireUserId(): Promise<string> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) redirect("/login");
  return id;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Quick-rate (stars only). Used by the cellar list and the detail star input.
export async function upsertRatingAction(wineId: string, rating: number): Promise<void> {
  const userId = await requireUserId();
  const r = snapRating(rating);
  await db
    .insert(reviews)
    .values({ userId, wineId, rating: String(r), tastedAt: today() })
    .onConflictDoUpdate({
      target: [reviews.userId, reviews.wineId],
      set: { rating: String(r) },
    });
  revalidatePath("/cellar");
  revalidatePath(`/wine/${wineId}`);
}

// Full review from the wine-detail form (stars + note + date).
export async function upsertReviewAction(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const wineId = String(formData.get("wineId"));
  const rawRating = Number(formData.get("rating"));
  if (!wineId || !rawRating) return; // no rating → nothing to save
  const rating = snapRating(rawRating);
  const tastingNote = (formData.get("tastingNote") as string) || null;
  const tastedAt = (formData.get("tastedAt") as string) || today();

  await db
    .insert(reviews)
    .values({ userId, wineId, rating: String(rating), tastingNote, tastedAt })
    .onConflictDoUpdate({
      target: [reviews.userId, reviews.wineId],
      set: { rating: String(rating), tastingNote, tastedAt },
    });
  revalidatePath("/cellar");
  redirect(`/wine/${wineId}`);
}
