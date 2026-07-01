// Invariant: Σ placements.quantity ≤ cellar_items.quantity. The unplaced count
// is the remainder. reconcilePlacements restores the invariant after a quantity
// drop (drink, edit-down, etc.) by trimming from the most-recent placement first.
export function placedTotal(placements: { quantity: number }[]): number {
  return placements.reduce((sum, p) => sum + p.quantity, 0);
}

export function unplacedQuantity(itemQuantity: number, placements: { quantity: number }[]): number {
  return Math.max(0, itemQuantity - placedTotal(placements));
}

export function canPlace(itemQuantity: number, placements: { quantity: number }[], addQty: number): boolean {
  if (addQty < 1) return false;
  return placedTotal(placements) + addQty <= itemQuantity;
}

// Returns the placements with quantities trimmed so their total ≤ maxTotal.
// Trims from the end (most-recently-added first). Entries left at 0 should be
// deleted by the caller.
export function reconcilePlacements<T extends { quantity: number }>(placements: T[], maxTotal: number): T[] {
  const cap = Math.max(0, maxTotal);
  let excess = Math.max(0, placedTotal(placements) - cap);
  const result = placements.map((p) => ({ ...p }));
  for (let i = result.length - 1; i >= 0 && excess > 0; i--) {
    const take = Math.min(result[i].quantity, excess);
    result[i].quantity -= take;
    excess -= take;
  }
  return result;
}
