import { describe, expect, it } from "vitest";
import {
  ZMK_KEYCODES,
  parseModifiedKeyCode,
  isModifiedKeyCode,
} from "./keycodes";

describe("ZMK_KEYCODES", () => {
  it("has no duplicate codes", () => {
    const codes = ZMK_KEYCODES.map((k) => k.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("has all fields non-empty", () => {
    for (const kc of ZMK_KEYCODES) {
      expect(kc.code.length).toBeGreaterThan(0);
      expect(kc.label.length).toBeGreaterThan(0);
      expect(kc.category.length).toBeGreaterThan(0);
    }
  });

  it("contains expected categories", () => {
    const categories = new Set(ZMK_KEYCODES.map((k) => k.category));
    expect(categories).toContain("Letters");
    expect(categories).toContain("Numbers");
    expect(categories).toContain("Modifiers");
    expect(categories).toContain("Navigation");
    expect(categories).toContain("Punctuation");
    expect(categories).toContain("Control");
    expect(categories).toContain("Function");
    expect(categories).toContain("Keypad");
    expect(categories).toContain("Media");
    expect(categories).toContain("Shifted Symbols");
  });

  it("has 26 letters", () => {
    expect(ZMK_KEYCODES.filter((k) => k.category === "Letters")).toHaveLength(26);
  });

  it("has 10 numbers", () => {
    expect(ZMK_KEYCODES.filter((k) => k.category === "Numbers")).toHaveLength(10);
  });

  it("has 24 function keys", () => {
    expect(ZMK_KEYCODES.filter((k) => k.category === "Function")).toHaveLength(24);
  });

  it("has 21 shifted symbol keycodes", () => {
    const shifted = ZMK_KEYCODES.filter((k) => k.category === "Shifted Symbols");
    expect(shifted).toHaveLength(21);
    const codes = new Set(shifted.map((k) => k.code));
    expect(codes).toContain("EXCL");
    expect(codes).toContain("QMARK");
    expect(codes).toContain("TILDE");
    expect(codes).toContain("DQT");
    expect(codes).toContain("PIPE");
  });
});

describe("parseModifiedKeyCode", () => {
  it("parses plain key code", () => {
    expect(parseModifiedKeyCode("A")).toEqual({ key: "A", mods: [] });
  });

  it("parses single modifier wrapper", () => {
    expect(parseModifiedKeyCode("LC(S)")).toEqual({ key: "S", mods: ["LC"] });
  });

  it("parses nested modifier wrappers", () => {
    expect(parseModifiedKeyCode("LA(LC(V))")).toEqual({ key: "V", mods: ["LA", "LC"] });
  });

  it("parses deeply nested modifiers", () => {
    expect(parseModifiedKeyCode("LG(LA(LC(LS(A))))")).toEqual({
      key: "A",
      mods: ["LG", "LA", "LC", "LS"],
    });
  });

  it("parses all modifier types", () => {
    expect(parseModifiedKeyCode("LS(FSLH)")).toEqual({ key: "FSLH", mods: ["LS"] });
    expect(parseModifiedKeyCode("RG(LALT)")).toEqual({ key: "LALT", mods: ["RG"] });
  });
});

describe("isModifiedKeyCode", () => {
  it("returns false for plain key code", () => {
    expect(isModifiedKeyCode("A")).toBe(false);
  });

  it("returns true for modified key code", () => {
    expect(isModifiedKeyCode("LC(S)")).toBe(true);
    expect(isModifiedKeyCode("LA(LC(V))")).toBe(true);
  });
});
