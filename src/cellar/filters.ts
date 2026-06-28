export type CellarBottle = {
  itemId: string;
  producer: string | null;
  cuvee: string | null;
  vintage: number | null;
  region: string | null;
  color: string | null;
  quantity: number;
  purchasePrice: string | null;
  status: "in_cellar" | "drunk";
  drinkFrom: number | null;
  drinkTo: number | null;
  wineId: string;
  purchaseDate: string | null;
};

export type CellarParams = {
  color?: string;
  region?: string;
  status?: "in_cellar" | "drunk";
  sort?: "name" | "vintage" | "drink" | "recent" | "price";
};

// Pure filter + sort over the user's bottles. Defaults: in-cellar, newest-first.
export function filterAndSort(rows: CellarBottle[], params: CellarParams): CellarBottle[] {
  const status = params.status ?? "in_cellar";
  let out = rows.filter((b) => b.status === status);
  if (params.color) out = out.filter((b) => b.color === params.color);
  if (params.region) out = out.filter((b) => b.region === params.region);

  const sort = params.sort ?? "recent";
  const cmp: Record<string, (a: CellarBottle, b: CellarBottle) => number> = {
    name: (a, b) => (a.producer ?? "").localeCompare(b.producer ?? ""),
    vintage: (a, b) => (a.vintage ?? 0) - (b.vintage ?? 0),
    drink: (a, b) => (a.drinkTo ?? 9999) - (b.drinkTo ?? 9999),
    price: (a, b) => Number(b.purchasePrice ?? 0) - Number(a.purchasePrice ?? 0),
    recent: (a, b) => (b.purchaseDate ?? "").localeCompare(a.purchaseDate ?? ""),
  };
  return [...out].sort(cmp[sort] ?? cmp.recent);
}

// Distinct filterable values present in the user's bottles.
export function filterOptions(rows: CellarBottle[]): { regions: string[]; colors: string[] } {
  const regions = new Set<string>();
  const colors = new Set<string>();
  for (const b of rows) {
    if (b.region) regions.add(b.region);
    if (b.color) colors.add(b.color);
  }
  return { regions: [...regions], colors: [...colors] };
}
