"use server";

import { auth } from "@/auth/config";
import { searchWines } from "@/cellar/queries";

export async function searchWinesAction(query: string) {
  const session = await auth();
  if (!session?.user?.id) return [];
  return searchWines(query);
}
