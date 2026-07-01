import { describe, it, expect } from "vitest";
import { projectUnit, boardSize, compartmentPolygon, pointsAttr, CUBE, GAP, MARGIN } from "@/cave/iso";
import type { Unit } from "@/cave/compartments";

describe("projectUnit", () => {
  it("places gridY=0 on the bottom row and gridX left→right", () => {
    expect(projectUnit(0, 1, 2)).toEqual({ x: MARGIN, y: MARGIN });
    expect(projectUnit(0, 0, 2)).toEqual({ x: MARGIN, y: MARGIN + (CUBE + GAP) });
    expect(projectUnit(1, 1, 2)).toEqual({ x: MARGIN + (CUBE + GAP), y: MARGIN });
  });
});

describe("boardSize", () => {
  it("covers the extent of the units plus margins", () => {
    const s = boardSize([{ gridX: 0, gridY: 0 }, { gridX: 1, gridY: 0 }]);
    expect(s.width).toBeGreaterThan(2 * CUBE);
    expect(s.height).toBeGreaterThan(CUBE);
  });
  it("has a sane default for an empty cellar", () => {
    expect(boardSize([])).toEqual({ width: CUBE + 2 * MARGIN, height: CUBE + 2 * MARGIN });
  });
});

describe("compartmentPolygon (diamond)", () => {
  const diamond: Unit = { kind: "diamond", cols: null, rows: null };
  it("returns the north triangle meeting at the face center", () => {
    const poly = compartmentPolygon(diamond, "N", { x: 0, y: 0 });
    expect(poly).toEqual([{ x: 0, y: 0 }, { x: CUBE, y: 0 }, { x: CUBE / 2, y: CUBE / 2 }]);
  });
  it("returns [] for an invalid key", () => {
    expect(compartmentPolygon(diamond, "L1C1", { x: 0, y: 0 })).toEqual([]);
  });
});

describe("compartmentPolygon (grid)", () => {
  const grid: Unit = { kind: "grid", cols: 2, rows: 2 };
  it("returns the rectangle for a cell", () => {
    const poly = compartmentPolygon(grid, "L1C1", { x: 0, y: 0 });
    const h = CUBE / 2;
    expect(poly).toEqual([{ x: 0, y: 0 }, { x: h, y: 0 }, { x: h, y: h }, { x: 0, y: h }]);
  });
});

describe("pointsAttr", () => {
  it("formats points for an SVG polygon", () => {
    expect(pointsAttr([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe("0,0 10,5");
  });
});
