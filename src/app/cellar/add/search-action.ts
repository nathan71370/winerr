"use server";

import { searchWines } from "@/cellar/queries";

export async function searchWinesAction(query: string) {
  return searchWines(query);
}
