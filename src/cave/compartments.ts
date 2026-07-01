// A cube is either a "grid" (individual slots, cols × rows) or a "diamond"
// (an X divider → four bulk compartments N/E/S/O). Compartments are derived,
// never stored: a compartment is identified by a key valid for the unit's kind.
export type Unit = {
  kind: "grid" | "diamond";
  cols: number | null;
  rows: number | null;
};

const DIAMOND_KEYS = ["N", "E", "S", "O"] as const;

export function compartmentKeys(unit: Unit): string[] {
  if (unit.kind === "diamond") return [...DIAMOND_KEYS];
  const cols = unit.cols ?? 0;
  const rows = unit.rows ?? 0;
  const keys: string[] = [];
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) keys.push(`L${r}C${c}`);
  }
  return keys;
}

export function isValidCompartment(unit: Unit, key: string): boolean {
  return compartmentKeys(unit).includes(key);
}
