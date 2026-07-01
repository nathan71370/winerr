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

// Sutherland–Hodgman clip of a polygon to the axis-aligned square [0,S]×[0,S].
function clipToFrame(poly: Point[], S: number): Point[] {
  const edges: Array<(p: Point) => number> = [
    (p) => p.x,
    (p) => S - p.x,
    (p) => p.y,
    (p) => S - p.y,
  ];
  let out = poly;
  for (const inside of edges) {
    const input = out;
    out = [];
    for (let k = 0; k < input.length; k++) {
      const cur = input[k];
      const prev = input[(k + input.length - 1) % input.length];
      const curIn = inside(cur) >= 0;
      const prevIn = inside(prev) >= 0;
      if (curIn) {
        if (!prevIn) out.push(edgeIntersect(prev, cur, inside));
        out.push(cur);
      } else if (prevIn) {
        out.push(edgeIntersect(prev, cur, inside));
      }
    }
    if (out.length === 0) return [];
  }
  // A polygon vertex lying exactly on a clip line is emitted both as itself and
  // as that edge's "intersection" point; collapse the resulting duplicates.
  return out.filter((p, k) => {
    const prev = out[(k + out.length - 1) % out.length];
    return Math.abs(p.x - prev.x) > 1e-9 || Math.abs(p.y - prev.y) > 1e-9;
  });
}

function edgeIntersect(a: Point, b: Point, inside: (p: Point) => number): Point {
  const da = inside(a), db = inside(b);
  const t = da / (da - db);
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

// Absolute SVG polygon for one compartment on the cube whose front-face top-left
// is `origin`. grid "L{r}C{c}" → the cell rectangle; diamond "D{i}-{j}" → the
// cross-hatch diamond bin centered at lattice point (i,j), clipped to the frame
// (a full diamond inside, a triangle on the boundary).
// Returns [] for a key invalid for the unit's kind/dimensions.
export function compartmentPolygon(unit: Unit, key: string, origin: Point): Point[] {
  const { x, y } = origin;
  const S = CUBE;
  const cols = unit.cols ?? 0;
  const rows = unit.rows ?? 0;
  if (cols <= 0 || rows <= 0) return [];

  if (unit.kind === "diamond") {
    const m = /^D(\d+)-(\d+)$/.exec(key);
    if (!m) return [];
    const i = Number(m[1]), j = Number(m[2]);
    if (i < 0 || j < 0 || i > cols || j > rows || (i + j) % 2 !== 0) return [];
    const w = S / cols, h = S / rows;
    const cxL = i * w, cyL = j * h;
    const quad: Point[] = [
      { x: cxL, y: cyL - h },   // top
      { x: cxL + w, y: cyL },   // right
      { x: cxL, y: cyL + h },   // bottom
      { x: cxL - w, y: cyL },   // left
    ];
    return clipToFrame(quad, S).map((p) => ({ x: x + p.x, y: y + p.y }));
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
