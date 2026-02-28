import { describe, it, expect } from "vitest";
import { GLOVE80_GRID, GLOVE80_KEY_NAMES, GRID_COLS } from "./layout-map";

describe("GLOVE80_GRID", () => {
  it("has 7 rows (including spacer)", () => {
    expect(GLOVE80_GRID).toHaveLength(7);
  });

  it("has 19 columns per row", () => {
    for (const row of GLOVE80_GRID) {
      expect(row).toHaveLength(GRID_COLS);
    }
  });

  it("contains all 80 key indices exactly once", () => {
    const indices = GLOVE80_GRID.flat().filter((v): v is number => v !== null);
    expect(indices).toHaveLength(80);
    const sorted = [...indices].sort((a, b) => a - b);
    expect(sorted).toEqual(Array.from({ length: 80 }, (_, i) => i));
  });

  it("row 1 has 10 keys", () => {
    const keys = GLOVE80_GRID[0]!.filter((v) => v !== null);
    expect(keys).toHaveLength(10);
  });

  it("row 2 has 12 keys", () => {
    const keys = GLOVE80_GRID[1]!.filter((v) => v !== null);
    expect(keys).toHaveLength(12);
  });

  it("row 5 has 12 outer keys", () => {
    const keys = GLOVE80_GRID[4]!.filter((v) => v !== null);
    expect(keys).toHaveLength(12);
  });

  it("row 6 has 16 keys (outer bottom + inner)", () => {
    const keys = GLOVE80_GRID[5]!.filter((v) => v !== null);
    expect(keys).toHaveLength(16);
  });

  it("row 7 has 6 thumb keys", () => {
    const keys = GLOVE80_GRID[6]!.filter((v) => v !== null);
    expect(keys).toHaveLength(6);
  });
});

describe("GLOVE80_KEY_NAMES", () => {
  it("has 80 names", () => {
    expect(GLOVE80_KEY_NAMES).toHaveLength(80);
  });

  it("has no duplicate names", () => {
    expect(new Set(GLOVE80_KEY_NAMES).size).toBe(80);
  });

  it("all names match L/R + row + column pattern", () => {
    for (const name of GLOVE80_KEY_NAMES) {
      expect(name).toMatch(/^[LR][CNTMBFH]\d$/);
    }
  });

  it("has expected spot-check names", () => {
    expect(GLOVE80_KEY_NAMES[0]).toBe("LC1");   // Ceiling row
    expect(GLOVE80_KEY_NAMES[14]).toBe("LN5");  // Number row
    expect(GLOVE80_KEY_NAMES[52]).toBe("LH1");  // Thumb
    expect(GLOVE80_KEY_NAMES[79]).toBe("RF5");   // Floor row
  });
});
