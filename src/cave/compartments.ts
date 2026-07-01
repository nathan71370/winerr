// A cube is a `cols × rows` grid of cells. A "grid" cell is one square slot; a
// "diamond" cell is X-divided into 4 triangular bulk bins (N/E/S/O). Compartments
// are derived, never stored: grid → "L{r}C{c}"; diamond → "L{r}C{c}{N|E|S|O}".
export type Unit = {
  kind: "grid" | "diamond";
  cols: number | null;
  rows: number | null;
};

const DIRS = ["N", "E", "S", "O"] as const;

export function compartmentKeys(unit: Unit): string[] {
  const cols = unit.cols ?? 0;
  const rows = unit.rows ?? 0;
  const keys: string[] = [];
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      if (unit.kind === "diamond") {
        for (const d of DIRS) keys.push(`L${r}C${c}${d}`);
      } else {
        keys.push(`L${r}C${c}`);
      }
    }
  }
  return keys;
}

export function isValidCompartment(unit: Unit, key: string): boolean {
  return compartmentKeys(unit).includes(key);
}
