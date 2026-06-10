import { describe, it, expect, beforeAll } from "vitest";
import {
  listLayers, listMacros, listCombos, listHoldTaps, listModMorphs, listCondLayers,
  renderLayer, keyDetail, macroDetail, comboDetail,
} from "./render";
import { makeConfig } from "./test-fixtures";
import { setColorEnabled } from "./color";
import { displayWidth, stripAnsi } from "./text-width";

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

beforeAll(() => setColorEnabled(false));

describe("renderLayer (boxed)", () => {
  it("renders a header and one box per key", () => {
    const text = renderLayer(config, 0);
    const lines = text.split("\n");
    expect(lines[0]).toBe("Layer 0: default");
    expect((text.match(/┌/g) ?? []).length).toBe(80); // one box per key
  });

  it("shows labels, trans dot, and tap·hold cells inside boxes", () => {
    const text = renderLayer(config, 0);
    expect(text).toContain("⌘C");
    expect(text).toContain("A·⌘");
    expect(text).toContain("│"); // boxes drawn
    // pos 0 is trans → first middle row starts with a box containing ·
    const firstMid = text.split("\n")[3]!;
    expect(firstMid.trimStart().startsWith("│")).toBe(true);
    expect(firstMid).toContain("·");
  });

  it("keeps every line in a box row at equal display width", () => {
    const text = renderLayer(config, 0);
    const lines = text.split("\n");
    // box rows come in consecutive (top, mid, bottom) triples
    for (let i = 0; i < lines.length - 2; i++) {
      if (lines[i]!.trimStart().startsWith("┌")) {
        const w = displayWidth(lines[i]!);
        expect(displayWidth(lines[i + 1]!), `mid of row at line ${i}`).toBe(w);
        expect(displayWidth(lines[i + 2]!), `bottom of row at line ${i}`).toBe(w);
      }
    }
  });

  it("truncates long labels with an ellipsis instead of overflowing", () => {
    const cfg = makeConfig();
    cfg.layers[0]!.keys[10] = { tap: { type: "rgb_ug", action: "RGB_STATUS" }, hold: null };
    const text = renderLayer(cfg, 0);
    expect(text).toContain("…");
    expect(text).not.toContain("RGB_STATUS");
  });

  it("appends a legend for symbols used in the layer", () => {
    const text = renderLayer(config, 0);
    expect(text).toContain("tap·hold"); // pos 34 is a hold-tap
    expect(text).toContain("transparent"); // pos 0 is trans
  });

  it("colors survive alignment (ANSI stripped widths still equal)", () => {
    setColorEnabled(true);
    try {
      const text = renderLayer(config, 0);
      const lines = text.split("\n").map(stripAnsi);
      for (let i = 0; i < lines.length - 2; i++) {
        if (lines[i]!.trimStart().startsWith("┌")) {
          const w = displayWidth(lines[i]!);
          expect(displayWidth(lines[i + 1]!)).toBe(w);
          expect(displayWidth(lines[i + 2]!)).toBe(w);
        }
      }
      expect(text).toContain("\x1b[");
    } finally {
      setColorEnabled(false);
    }
  });
});

describe("keyDetail", () => {
  it("describes a plain kp key with its hold behavior", () => {
    const text = keyDetail(config, 0, 10);
    expect(text).toContain("LN1 (pos 10)");
    expect(text).toContain("default");
    expect(text).toContain("kp F5");
    expect(text).toContain("momentary");
    expect(text).toContain("symbols");
  });

  it("expands hold-tap definitions inline", () => {
    const text = keyDetail(config, 0, 34);
    expect(text).toContain("hold-tap hml_lgui(LGUI, A)");
    expect(text).toContain("flavor: balanced");
    expect(text).toContain("&kp LGUI");
    expect(text).toContain("&kp A");
  });

  it("marks empty hold slots", () => {
    const text = keyDetail(config, 0, 20);
    expect(text).toContain("hold: (none)");
  });
});

describe("macroDetail / comboDetail", () => {
  it("renders numbered macro steps", () => {
    const macro = config.macros![0]!;
    const text = macroDetail(macro);
    expect(text).toContain("macro copy_url (CopyURL)");
    expect(text).toContain("1. tap &kp LG(L)");
    expect(text).toContain("2. tap &kp LG(C)");
  });

  it("renders combo keys with names and binding", () => {
    const text = comboDetail(config, config.combos![0]!);
    expect(text).toContain("combo esc_combo");
    expect(text).toContain("LT1 (22) + LT2 (23)");
    expect(text).toContain("&kp ESC");
    expect(text).toContain("layers: all");
  });
});
