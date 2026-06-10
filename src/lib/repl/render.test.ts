import { describe, it, expect } from "vitest";
import {
  listLayers, listMacros, listCombos, listHoldTaps, listModMorphs, listCondLayers,
} from "./render";
import { makeConfig } from "./test-fixtures";

const config = makeConfig();

describe("list summaries", () => {
  it("lists layers with index, name, and bound-key count", () => {
    const lines = listLayers(config);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("default");
    expect(lines[0]).toContain("4 keys bound"); // pos 10, 20, 34, 43 (trans/none not counted)
  });

  it("lists macros with step count and label", () => {
    expect(listMacros(config)[0]).toBe("copy_url — 2 steps (CopyURL)");
  });

  it("lists combos with key names and binding", () => {
    expect(listCombos(config)[0]).toBe("esc_combo: LT1+LT2 → &kp ESC");
  });

  it("lists hold-taps with flavor and timing", () => {
    expect(listHoldTaps(config)[0]).toContain("hml_lgui");
    expect(listHoldTaps(config)[0]).toContain("balanced");
    expect(listHoldTaps(config)[0]).toContain("280ms");
  });

  it("lists mod-morphs with both bindings and mods", () => {
    expect(listModMorphs(config)[0]).toBe(
      "mm_bspc_shift_del: &kp BSPC / MOD_LSFT → &kp DEL",
    );
  });

  it("lists conditional layers with layer names", () => {
    expect(listCondLayers(config)[0]).toBe("tri_layer: symbols + system → system");
  });
});
