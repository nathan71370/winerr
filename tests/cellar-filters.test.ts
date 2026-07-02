import { describe, it, expect } from "vitest";
import { filterAndSort, filterOptions, type CellarBottle } from "@/cellar/filters";

const rows: CellarBottle[] = [
  { itemId: "1", producer: "Alpha", cuvee: null, vintage: 2015, region: "Bordeaux", color: "rouge", quantity: 2, purchasePrice: "30.00", status: "in_cellar", drinkFrom: 2020, drinkTo: 2030, wineId: "wA", purchaseDate: "2024-01-01", rating: "4.5" },
  { itemId: "2", producer: "Beta", cuvee: null, vintage: 2019, region: "Bourgogne", color: "blanc", quantity: 1, purchasePrice: "12.00", status: "in_cellar", drinkFrom: null, drinkTo: null, wineId: "wB", purchaseDate: "2024-02-01", rating: null },
  { itemId: "3", producer: "Gamma", cuvee: null, vintage: 2012, region: "Bordeaux", color: "rouge", quantity: 0, purchasePrice: null, status: "drunk", drinkFrom: 2015, drinkTo: 2022, wineId: "wC", purchaseDate: "2023-01-01", rating: "3.0" },
];

describe("filterAndSort", () => {
  it("defaults to in-cellar only", () => {
    const r = filterAndSort(rows, {});
    expect(r.map((b) => b.itemId).sort()).toEqual(["1", "2"]);
  });
  it("defaults to newest purchase first", () => {
    expect(filterAndSort(rows, {}).map((b) => b.itemId)).toEqual(["2", "1"]);
  });
  it("filters by color", () => {
    expect(filterAndSort(rows, { color: "blanc" }).map((b) => b.itemId)).toEqual(["2"]);
  });
  it("filters by region", () => {
    expect(filterAndSort(rows, { region: "Bordeaux" }).map((b) => b.itemId)).toEqual(["1"]);
  });
  it("shows drunk when status=drunk", () => {
    expect(filterAndSort(rows, { status: "drunk" }).map((b) => b.itemId)).toEqual(["3"]);
  });
  it("sorts by vintage ascending", () => {
    expect(filterAndSort(rows, { sort: "vintage" }).map((b) => b.vintage)).toEqual([2015, 2019]);
  });
  it("sorts by price descending", () => {
    expect(filterAndSort(rows, { sort: "price" }).map((b) => b.itemId)).toEqual(["1", "2"]);
  });
  it("sorts by rating descending, unrated last", () => {
    expect(filterAndSort(rows, { sort: "rating" }).map((b) => b.itemId)).toEqual(["1", "2"]);
  });
});

describe("filterOptions", () => {
  it("returns the distinct regions and colors across all rows", () => {
    const o = filterOptions(rows);
    expect(o.regions.sort()).toEqual(["Bordeaux", "Bourgogne"]);
    expect(o.colors.sort()).toEqual(["blanc", "rouge"]);
  });
});

describe("window filter", () => {
  const mk = (drinkFrom: number | null, drinkTo: number | null): CellarBottle => ({
    itemId: "i", quantity: 1, purchasePrice: null, purchaseDate: null, status: "in_cellar",
    wineId: "w", producer: "P", cuvee: null, vintage: null, region: null, color: null,
    drinkFrom, drinkTo, rating: null,
  });
  it("keeps only wines matching the window status", () => {
    const rows = [mk(2030, 2035), mk(2020, 2030), mk(2020, 2026), mk(2018, 2020)];
    const out = filterAndSort(rows, { status: "in_cellar", sort: "recent", window: "ready", currentYear: 2026 });
    expect(out).toHaveLength(1);
    expect(out[0].drinkFrom).toBe(2020);
    expect(out[0].drinkTo).toBe(2030);
  });
  it("excludes windowless wines when a window filter is set, keeps them otherwise", () => {
    const rows = [mk(null, null), mk(2020, 2030)];
    expect(filterAndSort(rows, { status: "in_cellar", sort: "recent", window: "ready", currentYear: 2026 })).toHaveLength(1);
    expect(filterAndSort(rows, { status: "in_cellar", sort: "recent" })).toHaveLength(2);
  });
});
