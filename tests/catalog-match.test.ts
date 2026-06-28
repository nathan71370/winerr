import { describe, it, expect } from "vitest";
import { bestMatch, type WineIdentity } from "@/catalog/match";

const q: WineIdentity = { producer: "Château Margaux", cuvee: null, vintage: 2015 };

describe("bestMatch", () => {
  it("matches an exact normalized producer + vintage with null cuvee", () => {
    const candidates: WineIdentity[] = [
      { id: "w1", producer: "Chateau Margaux", cuvee: null, vintage: 2015 },
      { id: "w2", producer: "Pavillon Rouge", cuvee: null, vintage: 2015 },
    ];
    expect(bestMatch(q, candidates)?.id).toBe("w1");
  });

  it("does not match a different vintage", () => {
    const candidates: WineIdentity[] = [
      { id: "w3", producer: "Chateau Margaux", cuvee: null, vintage: 2016 },
    ];
    expect(bestMatch(q, candidates)).toBeNull();
  });

  it("treats null cuvee and empty cuvee as the same", () => {
    const candidates: WineIdentity[] = [
      { id: "w4", producer: "Chateau Margaux", cuvee: "", vintage: 2015 },
    ];
    expect(bestMatch(q, candidates)?.id).toBe("w4");
  });

  it("returns null when nothing is close enough", () => {
    expect(bestMatch(q, [])).toBeNull();
  });
});
