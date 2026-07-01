// Pure SVG geometry for the isometric cave. A cube's interactive FRONT face is a
// straight CUBE×CUBE square; depth parallelograms (drawn by the component) add
// 2.5D volume. Cubes are arranged on a board by gridX (left→right) and gridY
// (stack level, 0 = bottom). Compartments are flat polygons on the front face.
import type { Unit } from "@/cave/compartments";

export const CUBE = 96;
export const GAP = 18;
export const MARGIN = 28;
export const DEPTH_X = 16;
export const DEPTH_Y = 12;

export type Point = { x: number; y: number };

// Top-left of a cube's front face. `rows` = total stack levels (max gridY + 1)
// so gridY 0 renders on the bottom row.
export function projectUnit(gridX: number, gridY: number, rows: number): Point {
  const pitch = CUBE + GAP;
  return { x: MARGIN + gridX * pitch, y: MARGIN + (rows - 1 - gridY) * pitch };
}

// Overall SVG canvas size for a set of units (adds headroom for the extrusion).
export function boardSize(units: { gridX: number; gridY: number }[]): { width: number; height: number } {
  if (units.length === 0) return { width: CUBE + 2 * MARGIN, height: CUBE + 2 * MARGIN };
  const pitch = CUBE + GAP;
  const maxX = Math.max(...units.map((u) => u.gridX));
  const maxY = Math.max(...units.map((u) => u.gridY));
  return {
    width: 2 * MARGIN + maxX * pitch + CUBE + DEPTH_X,
    height: 2 * MARGIN + maxY * pitch + CUBE + DEPTH_Y,
  };
}

// Absolute SVG polygon for one compartment on the cube whose front-face top-left
// is `origin`. Returns [] for a key invalid for the unit's kind/dimensions.
export function compartmentPolygon(unit: Unit, key: string, origin: Point): Point[] {
  const { x, y } = origin;
  const S = CUBE;
  if (unit.kind === "diamond") {
    const tl = { x, y }, tr = { x: x + S, y }, br = { x: x + S, y: y + S }, bl = { x, y: y + S };
    const c = { x: x + S / 2, y: y + S / 2 };
    switch (key) {
      case "N": return [tl, tr, c];
      case "E": return [tr, br, c];
      case "S": return [br, bl, c];
      case "O": return [bl, tl, c];
      default: return [];
    }
  }
  const m = /^L(\d+)C(\d+)$/.exec(key);
  if (!m) return [];
  const cols = unit.cols ?? 0, rows = unit.rows ?? 0;
  const r = Number(m[1]) - 1, c = Number(m[2]) - 1;
  if (cols <= 0 || rows <= 0 || r < 0 || c < 0 || r >= rows || c >= cols) return [];
  const cw = S / cols, ch = S / rows;
  const x0 = x + c * cw, y0 = y + r * ch;
  return [{ x: x0, y: y0 }, { x: x0 + cw, y: y0 }, { x: x0 + cw, y: y0 + ch }, { x: x0, y: y0 + ch }];
}

// Format points for an SVG <polygon points="..."> attribute.
export function pointsAttr(points: Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}
