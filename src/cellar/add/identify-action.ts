"use server";

import { auth } from "@/auth/config";
import { getAIProvider } from "@/ai";
import type { LabelExtraction } from "@/ai/types";

export type IdentifyResult = { extraction: LabelExtraction } | { error: string };

export async function identifyLabelAction(
  imageBase64: string,
  mimeType: string,
): Promise<IdentifyResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Non authentifié." };

  const provider = getAIProvider();
  if (!provider) return { error: "Identification IA non configurée (clé manquante). Saisis manuellement." };

  if (!imageBase64 || !mimeType.startsWith("image/")) {
    return { error: "Image invalide." };
  }

  try {
    const extraction = await provider.identifyLabel(imageBase64, mimeType);
    return { extraction };
  } catch (e) {
    console.error("[identify] failed", e);
    return { error: "Identification échouée. Saisis manuellement." };
  }
}
