import { normalize } from "@/lib/normalize";

export type WineIdentity = {
  id?: string;
  producer: string | null;
  cuvee: string | null;
  vintage: number | null;
};

// Returns the candidate whose normalized (producer, cuvee, vintage) equals the
// query's, or null. Vintage must match exactly; null/empty cuvee are equivalent.
export function bestMatch<T extends WineIdentity>(
  query: WineIdentity,
  candidates: T[],
): T | null {
  const key = (w: WineIdentity) =>
    `${normalize(w.producer)}|${normalize(w.cuvee)}|${w.vintage ?? ""}`;
  const target = key(query);
  for (const c of candidates) {
    if (key(c) === target) return c;
  }
  return null;
}
