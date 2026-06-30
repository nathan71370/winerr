"use server";

import { auth } from "@/auth/config";
import { enrichWine } from "@/ai/enrich";
import type { WineEnrichment } from "@/ai/enrich-types";

export type EnrichResult = { enrichment: WineEnrichment } | { error: string };

export async function enrichWineAction(
  producer: string,
  cuvee: string | null,
  vintage: number | null,
): Promise<EnrichResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Non authentifié." };
  if (!producer || producer.trim().length < 2) return { error: "Renseigne au moins le domaine." };

  const enrichment = await enrichWine({ producer, cuvee, vintage });
  if (!enrichment) return { error: "Enrichissement indisponible (clés manquantes ou rien trouvé)." };
  return { enrichment };
}
