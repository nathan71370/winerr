"use server";

import { auth } from "@/auth/config";
import { getAIProvider } from "@/ai";
import { getUserAIConfig } from "@/settings/queries";
import type { LabelExtraction } from "@/ai/types";

export type IdentifyResult = { extraction: LabelExtraction } | { error: string };

export async function identifyLabelAction(
  imageBase64: string,
  mimeType: string,
): Promise<IdentifyResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Non authentifié." };

  const config = await getUserAIConfig(session.user.id);
  const provider = getAIProvider(config);
  if (!provider) return { error: "Configure tes clés IA dans les réglages." };

  if (!imageBase64 || !mimeType.startsWith("image/")) {
    return { error: "Image invalide." };
  }

  try {
    const extraction = await provider.identifyLabel(imageBase64, mimeType);
    return { extraction };
  } catch (e) {
    console.error("[identify] failed", e);
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("429")) {
      return { error: "Quota IA atteint (limite du palier gratuit). Réessaie dans un moment, ou saisis manuellement." };
    }
    return { error: "Identification échouée. Saisis manuellement." };
  }
}
