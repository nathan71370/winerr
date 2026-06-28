import { db } from "@/db";
import { wines } from "@/db/schema";
import { bestMatch, type WineIdentity } from "@/catalog/match";

export type EnsureWineInput = {
  producer: string;
  cuvee?: string | null;
  vintage?: number | null;
  region?: string | null;
  country?: string | null;
  color: "rouge" | "blanc" | "rose" | "effervescent";
  grapes?: string | null;
  lwinCode?: string | null;
};

// Resolves the canonical wines row for an identity, creating it if absent.
// Matches on normalized producer+cuvee+vintage via bestMatch.
export async function ensureWine(input: EnsureWineInput): Promise<string> {
  const candidates = await db
    .select({ id: wines.id, producer: wines.producer, cuvee: wines.cuvee, vintage: wines.vintage })
    .from(wines);

  const query: WineIdentity = {
    producer: input.producer,
    cuvee: input.cuvee ?? null,
    vintage: input.vintage ?? null,
  };
  const match = bestMatch(query, candidates);
  if (match?.id) return match.id;

  try {
    const inserted = await db
      .insert(wines)
      .values({
        producer: input.producer,
        cuvee: input.cuvee ?? null,
        vintage: input.vintage ?? null,
        region: input.region ?? null,
        country: input.country ?? null,
        color: input.color,
        grapes: input.grapes ?? null,
        lwinCode: input.lwinCode ?? null,
      })
      .returning({ id: wines.id });
    return inserted[0].id;
  } catch (err) {
    // Concurrent add of the same new wine: the other call won the insert and
    // tripped the uniq_wine constraint here. Re-query and return the winner.
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "23505") {
      const retry = await db
        .select({ id: wines.id, producer: wines.producer, cuvee: wines.cuvee, vintage: wines.vintage })
        .from(wines);
      const found = bestMatch(query, retry);
      if (found?.id) return found.id;
    }
    throw err;
  }
}
