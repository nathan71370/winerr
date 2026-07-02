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
// is `origin`. grid "L{r}C{c}" → the cell rectangle; diamond "D{a}-{b}" → a small
// diamond tiling the frame's inscribed diamond (rotated coords s=x+y, t=x-y; the
// inscribed diamond is the square s∈[S/2,3S/2], t∈[-S/2,S/2]); "CTL1"/"CTL2"/
// "CTR1"/"CTR2"/"CBR1"/"CBR2"/"CBL1"/"CBL2" → the 4 frame corners outside the
// inscribed diamond, each split in two by the frame diagonal through that corner.
// Returns [] for a key invalid for the unit's kind/dimensions.
export function compartmentPolygon(unit: Unit, key: string, origin: Point): Point[] {
  const { x, y } = origin;
  const S = CUBE;
  const cols = unit.cols ?? 0;
  const rows = unit.rows ?? 0;
  if (cols <= 0 || rows <= 0) return [];

  if (unit.kind === "diamond") {
    const corners: Record<string, Array<[number, number]>> = {
      CTL1: [[0, 0], [S / 2, 0], [S / 4, S / 4]],
      CTL2: [[0, 0], [S / 4, S / 4], [0, S / 2]],
      CTR1: [[S / 2, 0], [S, 0], [3 * S / 4, S / 4]],
      CTR2: [[S, 0], [S, S / 2], [3 * S / 4, S / 4]],
      CBR1: [[S, S / 2], [S, S], [3 * S / 4, 3 * S / 4]],
      CBR2: [[S, S], [S / 2, S], [3 * S / 4, 3 * S / 4]],
      CBL1: [[S / 2, S], [0, S], [S / 4, 3 * S / 4]],
      CBL2: [[0, S], [0, S / 2], [S / 4, 3 * S / 4]],
    };
    if (corners[key]) return corners[key].map(([px, py]) => ({ x: x + px, y: y + py }));
    const m = /^D(\d+)-(\d+)$/.exec(key);
    if (!m) return [];
    const a = Number(m[1]), b = Number(m[2]);
    if (a < 0 || b < 0 || a >= cols || b >= rows) return [];
    const sw = S / cols, th = S / rows;
    const s0 = S / 2 + a * sw, t0 = -S / 2 + b * th;
    const stPts: Array<[number, number]> = [
      [s0, t0], [s0 + sw, t0], [s0 + sw, t0 + th], [s0, t0 + th],
    ];
    return stPts.map(([s, t]) => ({ x: x + (s + t) / 2, y: y + (s - t) / 2 }));
  }

  const m = /^L(\d+)C(\d+)$/.exec(key);
  if (!m) return [];
  const r = Number(m[1]) - 1, c = Number(m[2]) - 1;
  if (r < 0 || c < 0 || r >= rows || c >= cols) return [];
  const cw = S / cols, ch = S / rows;
  const x0 = x + c * cw, y0 = y + r * ch;
  return [{ x: x0, y: y0 }, { x: x0 + cw, y: y0 }, { x: x0 + cw, y: y0 + ch }, { x: x0, y: y0 + ch }];
}

// Format points for an SVG <polygon points="..."> attribute.
export function pointsAttr(points: Point[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}
