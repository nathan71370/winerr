// A cube is a `cols × rows` grid of cells. A "grid" cell is one square slot.
// A "diamond" cell is a cross-hatch lattice: bins sit at points P(i,j) for
// i∈0..cols, j∈0..rows where (i+j) is even. An interior point is a full
// diamond bin (a bulk bin holding several bottles); a point on the frame
// boundary is clipped to a triangle. Compartments are derived, never stored:
// grid → "L{r}C{c}"; diamond → "D{i}-{j}".
export type Unit = {
  kind: "grid" | "diamond";
  cols: number | null;
  rows: number | null;
};

export function compartmentKeys(unit: Unit): string[] {
  const cols = unit.cols ?? 0;
  const rows = unit.rows ?? 0;
  const keys: string[] = [];
  if (cols <= 0 || rows <= 0) return keys;
  if (unit.kind === "diamond") {
    // Cross-hatch: one bin per even-sum lattice point (i+j even), clipped to the
    // frame → full diamonds inside, triangles on the boundary. Key "D{i}-{j}".
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        if ((i + j) % 2 === 0) keys.push(`D${i}-${j}`);
      }
    }
    return keys;
  }
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) keys.push(`L${r}C${c}`);
  }
  return keys;
}

export function isValidCompartment(unit: Unit, key: string): boolean {
  return compartmentKeys(unit).includes(key);
}
