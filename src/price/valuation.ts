// src/price/valuation.ts
// Pure money math for quotes. Prices flow in as numbers (pages convert the
// numeric-string columns); nulls mean "unknown" and are simply skipped.

// Signed % change from purchase to current estimate, rounded. Null when the
// purchase price can't be a base (≤ 0).
export function gainLossPct(purchase: number, estimate: number): number | null {
  if (purchase <= 0) return null;
  return Math.round(((estimate - purchase) / purchase) * 100);
}

export type ValuationRow = { quantity: number; purchasePrice: number | null; estimate: number | null };

// Cellar totals: estimated = Σ estimate×qty over quoted wines; purchase =
// Σ price×qty where a price is set; deltaPct compares the two when possible.
export function cellarValue(rows: ValuationRow[]): { estimated: number; purchase: number; deltaPct: number | null } {
  let estimated = 0;
  let purchase = 0;
  for (const r of rows) {
    if (r.estimate != null) estimated += r.estimate * r.quantity;
    if (r.purchasePrice != null) purchase += r.purchasePrice * r.quantity;
  }
  const deltaPct = purchase > 0 ? Math.round(((estimated - purchase) / purchase) * 100) : null;
  return { estimated, purchase, deltaPct };
}
