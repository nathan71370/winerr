import { requireUserId } from "@/auth/require-user";
import { getUserAIConfig } from "@/settings/queries";
import { isAIEnabled } from "@/ai";
import { hasQuoteKeys } from "@/price/service";
import AddForm from "./AddForm";

export default async function AddBottlePage() {
  const userId = await requireUserId();
  const config = await getUserAIConfig(userId);
  const ai = {
    canIdentify: isAIEnabled(config),
    canEnrich: hasQuoteKeys(config),
  };
  return <AddForm ai={ai} />;
}
