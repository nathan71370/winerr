// A cube is a `cols × rows` grid of cells. A "grid" cell is one square slot.
// A "diamond" cell tiles the frame's inscribed diamond (the rotated square
// whose vertices are the 4 edge-midpoints of the CUBE×CUBE front face) with
// cols×rows small diamonds, plus 4 corner triangles (the frame corners
// outside the inscribed diamond). Compartments are derived, never stored:
// grid → "L{r}C{c}"; diamond → "D{a}-{b}" (a∈0..cols-1, b∈0..rows-1) then
// the 4 corner triangles "CTL", "CTR", "CBR", "CBL".
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
    // cols×rows small diamonds tiling the frame's inscribed diamond (row-major),
    // then the 4 corner triangles.
    for (let b = 0; b < rows; b++) {
      for (let a = 0; a < cols; a++) keys.push(`D${a}-${b}`);
    }
    keys.push("CTL", "CTR", "CBR", "CBL");
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
