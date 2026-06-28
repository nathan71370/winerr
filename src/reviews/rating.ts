// Snap a raw value to a valid rating: 0.5 steps, clamped to [0.5, 5].
export function snapRating(raw: number): number {
  const snapped = Math.round(raw * 2) / 2;
  return Math.min(5, Math.max(0.5, snapped));
}

// Per-star fill states for a rating (5 entries): full / half / empty.
export function starFills(rating: number): ("full" | "half" | "empty")[] {
  const out: ("full" | "half" | "empty")[] = [];
  for (let s = 1; s <= 5; s++) {
    if (rating >= s) out.push("full");
    else if (rating >= s - 0.5) out.push("half");
    else out.push("empty");
  }
  return out;
}
