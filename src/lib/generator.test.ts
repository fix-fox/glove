import { describe, it, expect } from "vitest";
import { behaviorToString, generateKeymap, sanitizeLayerName, validateConfig } from "./generator";
import type { Key, KeyboardConfig, Layer } from "../types/schema";
import { randomUUID } from "crypto";

describe("behaviorToString", () => {
  it("generates &kp for key press", () => {
    const key: Key = { tap: { type: "kp", keyCode: "A" }, hold: null };
    expect(behaviorToString(key)).toBe("&kp A");
  });

  it("generates &kp for modifier key", () => {
    const key: Key = { tap: { type: "kp", keyCode: "LSHIFT" }, hold: null };
    expect(behaviorToString(key)).toBe("&kp LSHIFT");
  });

  it("generates &mo for momentary layer", () => {
    const key: Key = { tap: { type: "mo", layerIndex: 1 }, hold: null };
    expect(behaviorToString(key)).toBe("&mo 1");
  });

  it("generates &to for toggle layer", () => {
    const key: Key = { tap: { type: "to", layerIndex: 2 }, hold: null };
    expect(behaviorToString(key)).toBe("&to 2");
  });

  it("generates &sl for sticky layer", () => {
    const key: Key = { tap: { type: "sl", layerIndex: 1 }, hold: null };
    expect(behaviorToString(key)).toBe("&sl 1");
  });

  it("generates &trans", () => {
    const key: Key = { tap: { type: "trans" }, hold: null };
    expect(behaviorToString(key)).toBe("&trans");
  });

  it("generates &none", () => {
    const key: Key = { tap: { type: "none" }, hold: null };
    expect(behaviorToString(key)).toBe("&none");
  });

  it("generates &bootloader", () => {
    const key: Key = { tap: { type: "bootloader" }, hold: null };
    expect(behaviorToString(key)).toBe("&bootloader");
  });

  it("generates &sys_reset", () => {
    const key: Key = { tap: { type: "sys_reset" }, hold: null };
    expect(behaviorToString(key)).toBe("&sys_reset");
  });

  it("generates &bt BT_SEL with profile", () => {
    const key: Key = { tap: { type: "bt", action: "BT_SEL", profileIndex: 2 }, hold: null };
    expect(behaviorToString(key)).toBe("&bt BT_SEL 2");
  });

  it("generates &bt BT_CLR without profile", () => {
    const key: Key = { tap: { type: "bt", action: "BT_CLR" }, hold: null };
    expect(behaviorToString(key)).toBe("&bt BT_CLR");
  });

  it("generates &bt BT_NXT", () => {
    const key: Key = { tap: { type: "bt", action: "BT_NXT" }, hold: null };
    expect(behaviorToString(key)).toBe("&bt BT_NXT");
  });

  it("generates &tog for toggle layer on/off", () => {
    const key: Key = { tap: { type: "tog", layerIndex: 3 }, hold: null };
    expect(behaviorToString(key)).toBe("&tog 3");
  });

  it("generates &caps_word", () => {
    const key: Key = { tap: { type: "caps_word" }, hold: null };
    expect(behaviorToString(key)).toBe("&caps_word");
  });

  it("generates &rgb_ug with action", () => {
    const key: Key = { tap: { type: "rgb_ug", action: "RGB_TOG" }, hold: null };
    expect(behaviorToString(key)).toBe("&rgb_ug RGB_TOG");
  });

  it("generates &out with action", () => {
    const key: Key = { tap: { type: "out", action: "OUT_BLE" }, hold: null };
    expect(behaviorToString(key)).toBe("&out OUT_BLE");
  });

  it("generates &mmv with direction", () => {
    const key: Key = { tap: { type: "mmv", direction: "MOVE_UP" }, hold: null };
    expect(behaviorToString(key)).toBe("&mmv MOVE_UP");
  });

  it("generates &msc with direction", () => {
    const key: Key = { tap: { type: "msc", direction: "SCRL_DOWN" }, hold: null };
    expect(behaviorToString(key)).toBe("&msc SCRL_DOWN");
  });

  it("generates &mkp with button", () => {
    const key: Key = { tap: { type: "mkp", button: "LCLK" }, hold: null };
    expect(behaviorToString(key)).toBe("&mkp LCLK");
  });

  it("generates &lt for layer-tap (hold=tog)", () => {
    const key: Key = {
      tap: { type: "kp", keyCode: "A" },
      hold: { type: "tog", layerIndex: 2 },
    };
    expect(behaviorToString(key)).toBe("&lt 2 A");
  });

  it("generates &lt for layer-tap (hold=mo)", () => {
    const key: Key = {
      tap: { type: "kp", keyCode: "SPACE" },
      hold: { type: "mo", layerIndex: 1 },
    };
    expect(behaviorToString(key)).toBe("&lt 1 SPACE");
  });

  it("generates &lt for layer-tap (hold=to)", () => {
    const key: Key = {
      tap: { type: "kp", keyCode: "TAB" },
      hold: { type: "to", layerIndex: 2 },
    };
    expect(behaviorToString(key)).toBe("&lt 2 TAB");
  });

  it("generates &lt for layer-tap (hold=sl)", () => {
    const key: Key = {
      tap: { type: "kp", keyCode: "ESC" },
      hold: { type: "sl", layerIndex: 0 },
    };
    expect(behaviorToString(key)).toBe("&lt 0 ESC");
  });

  it("generates &lt_<name> for layer-tap with non-kp tap", () => {
    const key: Key = {
      tap: { type: "mod_morph", name: "mm_bspc_shift_del" },
      hold: { type: "mo", layerIndex: 4 },
    };
    expect(behaviorToString(key)).toBe("&lt_mm_bspc_shift_del 4 0");
  });

  it("generates &mt for mod-tap (hold=kp modifier)", () => {
    const key: Key = {
      tap: { type: "kp", keyCode: "A" },
      hold: { type: "kp", keyCode: "LSHIFT" },
    };
    expect(behaviorToString(key)).toBe("&mt LSHIFT A");
  });

  it("generates &mt for RCTRL mod-tap", () => {
    const key: Key = {
      tap: { type: "kp", keyCode: "Z" },
      hold: { type: "kp", keyCode: "RCTRL" },
    };
    expect(behaviorToString(key)).toBe("&mt RCTRL Z");
  });
});

function makeKey(tap: Key["tap"], hold: Key["hold"] = null): Key {
  return { tap, hold };
}

function makeLayer(name: string, keys: Key[] = []): Layer {
  const padded = keys.concat(
    Array.from({ length: 80 - keys.length }, () => makeKey({ type: "trans" }))
  );
  return { id: randomUUID(), name, keys: padded };
}

function makeConfig(layers: Layer[]): KeyboardConfig {
  return { name: "Test", version: 1, layers };
}

describe("validateConfig", () => {
  it("returns no errors for valid config", () => {
    const config = makeConfig([
      makeLayer("Base", [makeKey({ type: "kp", keyCode: "A" })]),
    ]);
    expect(validateConfig(config)).toEqual([]);
  });

  it("detects out-of-bounds layerIndex in tap", () => {
    const config = makeConfig([
      makeLayer("Base", [makeKey({ type: "mo", layerIndex: 5 })]),
    ]);
    const errors = validateConfig(config);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.path).toBe("layers[0].keys[0].tap");
    expect(errors[0]!.message).toContain("out of bounds");
  });

  it("detects out-of-bounds layerIndex in hold", () => {
    const config = makeConfig([
      makeLayer("Base", [
        makeKey({ type: "kp", keyCode: "A" }, { type: "mo", layerIndex: 3 }),
      ]),
    ]);
    const errors = validateConfig(config);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.path).toBe("layers[0].keys[0].hold");
  });

  it("detects BT_SEL without profileIndex", () => {
    const config = makeConfig([
      makeLayer("Base", [
        makeKey({ type: "bt", action: "BT_SEL" }),
      ]),
    ]);
    const errors = validateConfig(config);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("BT_SEL requires profileIndex");
  });

  it("allows BT_CLR without profileIndex", () => {
    const config = makeConfig([
      makeLayer("Base", [
        makeKey({ type: "bt", action: "BT_CLR" }),
      ]),
    ]);
    expect(validateConfig(config)).toEqual([]);
  });

  it("detects invalid hold behavior (bootloader)", () => {
    const config = makeConfig([
      makeLayer("Base", [
        makeKey({ type: "kp", keyCode: "A" }, { type: "bootloader" }),
      ]),
    ]);
    const errors = validateConfig(config);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("hold must be kp or layer behavior");
  });

  it("detects &mt with non-modifier keyCode", () => {
    const config = makeConfig([
      makeLayer("Base", [
        makeKey({ type: "kp", keyCode: "A" }, { type: "kp", keyCode: "B" }),
      ]),
    ]);
    const errors = validateConfig(config);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("mod-tap requires modifier keyCode");
  });

  it("allows &mt with valid modifier", () => {
    const config = makeConfig([
      makeLayer("Base", [
        makeKey({ type: "kp", keyCode: "A" }, { type: "kp", keyCode: "LGUI" }),
      ]),
    ]);
    expect(validateConfig(config)).toEqual([]);
  });

  it("allows &mt with modified modifier keyCode like LC(LSHIFT)", () => {
    const config = makeConfig([
      makeLayer("Base", [
        makeKey({ type: "kp", keyCode: "A" }, { type: "kp", keyCode: "LC(LSHIFT)" }),
      ]),
    ]);
    expect(validateConfig(config)).toEqual([]);
  });

  it("allows layer-tap with non-kp tap", () => {
    const config = makeConfig([
      makeLayer("Base", [
        makeKey({ type: "mod_morph", name: "mm_test" }, { type: "mo", layerIndex: 0 }),
      ]),
    ]);
    const errors = validateConfig(config);
    expect(errors.some((e) => e.message.includes("layer-tap"))).toBe(false);
  });

  it("detects mod-tap with non-kp tap", () => {
    const config = makeConfig([
      makeLayer("Base", [
        makeKey({ type: "macro", macroName: "test" }, { type: "kp", keyCode: "LSHIFT" }),
      ]),
    ]);
    const errors = validateConfig(config);
    expect(errors.some((e) => e.message.includes("mod-tap requires key press tap"))).toBe(true);
  });

  it("detects duplicate sanitized layer names", () => {
    const config = makeConfig([
      makeLayer("Base!"),
      makeLayer("Base?"),
    ]);
    const errors = validateConfig(config);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.path).toBe("layers[1].name");
    expect(errors[0]!.message).toContain("duplicate layer name");
  });

  it("collects multiple errors", () => {
    const config = makeConfig([
      makeLayer("Base", [
        makeKey({ type: "mo", layerIndex: 9 }),
        makeKey({ type: "bt", action: "BT_SEL" }),
      ]),
    ]);
    const errors = validateConfig(config);
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe("sanitizeLayerName", () => {
  it("lowercases and keeps alphanumeric", () => {
    expect(sanitizeLayerName("Base")).toBe("base");
  });

  it("replaces spaces with underscores", () => {
    expect(sanitizeLayerName("My Layer")).toBe("my_layer");
  });

  it("replaces special characters", () => {
    expect(sanitizeLayerName("Layer!@#$")).toBe("layer");
  });

  it("collapses consecutive underscores", () => {
    expect(sanitizeLayerName("A  --  B")).toBe("a_b");
  });

  it("prefixes with layer_ if starts with digit", () => {
    expect(sanitizeLayerName("2nd Layer")).toBe("layer_2nd_layer");
  });

  it("handles already clean names", () => {
    expect(sanitizeLayerName("lower")).toBe("lower");
  });

  it("strips trailing underscores", () => {
    expect(sanitizeLayerName("test!")).toBe("test");
  });

  it("returns fallback for all-special-character names", () => {
    expect(sanitizeLayerName("!!!")).toBe("layer");
  });
});

describe("generateKeymap", () => {
  it("returns errors when config is invalid", () => {
    const config = makeConfig([
      makeLayer("Base", [makeKey({ type: "mo", layerIndex: 5 })]),
    ]);
    const result = generateKeymap(config);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it("generates valid .keymap for single-layer config", () => {
    const keys = Array.from({ length: 80 }, () =>
      makeKey({ type: "kp", keyCode: "A" })
    );
    const config = makeConfig([{ id: randomUUID(), name: "Base", keys }]);
    const result = generateKeymap(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keymap).toContain("#include <behaviors.dtsi>");
      expect(result.keymap).toContain("#include <dt-bindings/zmk/keys.h>");
      expect(result.keymap).toContain("#include <dt-bindings/zmk/bt.h>");
      expect(result.keymap).toContain('compatible = "zmk,keymap"');
      expect(result.keymap).toContain("base {");
      expect(result.keymap).toContain("&kp A");
    }
  });

  it("generates multi-layer .keymap", () => {
    const baseKeys = Array.from({ length: 80 }, () =>
      makeKey({ type: "kp", keyCode: "A" })
    );
    const lowerKeys = Array.from({ length: 80 }, () =>
      makeKey({ type: "trans" })
    );
    const config = makeConfig([
      { id: randomUUID(), name: "Base", keys: baseKeys },
      { id: randomUUID(), name: "Lower", keys: lowerKeys },
    ]);
    const result = generateKeymap(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keymap).toContain("base {");
      expect(result.keymap).toContain("lower {");
      expect(result.keymap).toContain("&trans");
    }
  });

  it("sanitizes layer names in output", () => {
    const keys = Array.from({ length: 80 }, () =>
      makeKey({ type: "kp", keyCode: "A" })
    );
    const config = makeConfig([
      { id: randomUUID(), name: "2nd Layer!", keys },
    ]);
    const result = generateKeymap(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keymap).toContain("layer_2nd_layer {");
      expect(result.keymap).not.toContain("2nd Layer!");
    }
  });

  it("includes all 80 bindings in output", () => {
    const keys = Array.from({ length: 80 }, (_, i) =>
      makeKey({ type: "kp", keyCode: `K${i}` })
    );
    const config = makeConfig([{ id: randomUUID(), name: "Base", keys }]);
    const result = generateKeymap(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keymap).toContain("&kp K0");
      expect(result.keymap).toContain("&kp K79");
      const matches = result.keymap.match(/&kp K\d+/g);
      expect(matches).toHaveLength(80);
    }
  });

  it("includes outputs.h when out behavior is used", () => {
    const keys = Array.from({ length: 80 }, () =>
      makeKey({ type: "trans" })
    );
    keys[0] = makeKey({ type: "out", action: "OUT_BLE" });
    const config = makeConfig([{ id: randomUUID(), name: "Base", keys }]);
    const result = generateKeymap(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keymap).toContain("#include <dt-bindings/zmk/outputs.h>");
    }
  });

  it("includes rgb.h when rgb_ug behavior is used", () => {
    const keys = Array.from({ length: 80 }, () =>
      makeKey({ type: "trans" })
    );
    keys[0] = makeKey({ type: "rgb_ug", action: "RGB_TOG" });
    const config = makeConfig([{ id: randomUUID(), name: "Base", keys }]);
    const result = generateKeymap(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keymap).toContain("#include <dt-bindings/zmk/rgb.h>");
    }
  });

  it("includes pointing.h when mouse behaviors are used", () => {
    const keys = Array.from({ length: 80 }, () =>
      makeKey({ type: "trans" })
    );
    keys[0] = makeKey({ type: "mmv", direction: "MOVE_UP" });
    keys[1] = makeKey({ type: "msc", direction: "SCRL_UP" });
    keys[2] = makeKey({ type: "mkp", button: "LCLK" });
    const config = makeConfig([{ id: randomUUID(), name: "Base", keys }]);
    const result = generateKeymap(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keymap).toContain("#include <dt-bindings/zmk/pointing.h>");
    }
  });

  it("omits extra includes when not needed", () => {
    const keys = Array.from({ length: 80 }, () =>
      makeKey({ type: "kp", keyCode: "A" })
    );
    const config = makeConfig([{ id: randomUUID(), name: "Base", keys }]);
    const result = generateKeymap(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keymap).not.toContain("outputs.h");
      expect(result.keymap).not.toContain("rgb.h");
      expect(result.keymap).not.toContain("pointing.h");
    }
  });

  it("formats bindings in physical rows", () => {
    const keys = Array.from({ length: 80 }, (_, i) =>
      makeKey({ type: "kp", keyCode: `K${i}` })
    );
    const config = makeConfig([{ id: randomUUID(), name: "Base", keys }]);
    const result = generateKeymap(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Bindings block should have multiple lines (not one giant line)
      const bindingsMatch = result.keymap.match(/bindings = <([\s\S]*?)>/);
      expect(bindingsMatch).not.toBeNull();
      const bindingsLines = bindingsMatch![1]!.trim().split("\n");
      expect(bindingsLines.length).toBeGreaterThan(1);
    }
  });

  it("emits macros section", () => {
    const config: KeyboardConfig = {
      ...makeConfig([makeLayer("Base")]),
      macros: [{
        id: randomUUID(),
        name: "lang_toggle",
        waitMs: 30,
        tapMs: 30,
        steps: [
          { directive: "tap", bindings: ["&kp LALT", "&kp LSHIFT"] },
        ],
      }],
    };
    const result = generateKeymap(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keymap).toContain("macros {");
      expect(result.keymap).toContain("lang_toggle: lang_toggle {");
      expect(result.keymap).toContain('compatible = "zmk,behavior-macro"');
      expect(result.keymap).toContain("wait-ms = <30>");
      expect(result.keymap).toContain("tap-ms = <30>");
      expect(result.keymap).toContain("<&macro_tap &kp LALT &kp LSHIFT>");
    }
  });

  it("emits macro with pause_for_release", () => {
    const config: KeyboardConfig = {
      ...makeConfig([makeLayer("Base")]),
      macros: [{
        id: randomUUID(),
        name: "my_macro",
        steps: [
          { directive: "press", bindings: ["&kp LSHIFT"] },
          { directive: "pause_for_release" },
          { directive: "release", bindings: ["&kp LSHIFT"] },
        ],
      }],
    };
    const result = generateKeymap(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keymap).toContain("<&macro_press &kp LSHIFT>");
      expect(result.keymap).toContain("<&macro_pause_for_release>");
      expect(result.keymap).toContain("<&macro_release &kp LSHIFT>");
    }
  });

  it("emits behaviors section with mod-morph", () => {
    const config: KeyboardConfig = {
      ...makeConfig([makeLayer("Base")]),
      modMorphs: [{
        id: randomUUID(),
        name: "bspc_del",
        defaultBinding: "&kp BSPC",
        morphBinding: "&kp DEL",
        mods: ["MOD_LSFT", "MOD_RSFT"],
      }],
    };
    const result = generateKeymap(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keymap).toContain("behaviors {");
      expect(result.keymap).toContain("bspc_del: bspc_del {");
      expect(result.keymap).toContain('compatible = "zmk,behavior-mod-morph"');
      expect(result.keymap).toContain("bindings = <&kp BSPC>, <&kp DEL>;");
      expect(result.keymap).toContain("mods = <(MOD_LSFT|MOD_RSFT)>;");
    }
  });

  it("emits behaviors section with hold-tap", () => {
    const config: KeyboardConfig = {
      ...makeConfig([makeLayer("Base")]),
      holdTaps: [{
        id: randomUUID(),
        name: "hml",
        flavor: "balanced",
        tappingTermMs: 280,
        quickTapMs: 175,
        requirePriorIdleMs: 150,
        holdBinding: "&kp",
        tapBinding: "&kp",
        holdTriggerKeyPositions: [5, 6, 7, 8, 9],
        holdTriggerOnRelease: true,
      }],
    };
    const result = generateKeymap(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keymap).toContain("hml: hml {");
      expect(result.keymap).toContain('compatible = "zmk,behavior-hold-tap"');
      expect(result.keymap).toContain('#binding-cells = <2>');
      expect(result.keymap).toContain('flavor = "balanced"');
      expect(result.keymap).toContain("tapping-term-ms = <280>");
      expect(result.keymap).toContain("quick-tap-ms = <175>");
      expect(result.keymap).toContain("require-prior-idle-ms = <150>");
      expect(result.keymap).toContain("bindings = <&kp>, <&kp>;");
      expect(result.keymap).toContain("hold-trigger-key-positions = <5 6 7 8 9>;");
      expect(result.keymap).toContain("hold-trigger-on-release;");
    }
  });

  it("emits combos section", () => {
    const config: KeyboardConfig = {
      ...makeConfig([makeLayer("Base")]),
      combos: [{
        id: randomUUID(),
        name: "caps_combo",
        keyPositions: [52, 57],
        binding: "&caps_word",
        timeoutMs: 50,
        layers: [0],
      }],
    };
    const result = generateKeymap(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keymap).toContain("combos {");
      expect(result.keymap).toContain('compatible = "zmk,combos"');
      expect(result.keymap).toContain("caps_combo {");
      expect(result.keymap).toContain("key-positions = <52 57>;");
      expect(result.keymap).toContain("bindings = <&caps_word>;");
      expect(result.keymap).toContain("timeout-ms = <50>;");
      expect(result.keymap).toContain("layers = <0>;");
    }
  });

  it("emits conditional_layers section", () => {
    const config: KeyboardConfig = {
      ...makeConfig([makeLayer("Base"), makeLayer("Sym"), makeLayer("Nav")]),
      conditionalLayers: [{
        id: randomUUID(),
        name: "tri_layer",
        ifLayers: [1, 2],
        thenLayer: 2,
      }],
    };
    const result = generateKeymap(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keymap).toContain("conditional_layers {");
      expect(result.keymap).toContain('compatible = "zmk,conditional-layers"');
      expect(result.keymap).toContain("tri_layer {");
      expect(result.keymap).toContain("if-layers = <1 2>;");
      expect(result.keymap).toContain("then-layer = <2>;");
    }
  });

  it("generates &macro_name for macro behavior", () => {
    const key: Key = { tap: { type: "macro", macroName: "lang_toggle" }, hold: null };
    expect(behaviorToString(key)).toBe("&lang_toggle");
  });

  it("generates &name for mod-morph behavior", () => {
    const key: Key = { tap: { type: "mod_morph", name: "bspc_del" }, hold: null };
    expect(behaviorToString(key)).toBe("&bspc_del");
  });

  it("generates &name param1 param2 for hold-tap behavior", () => {
    const key: Key = { tap: { type: "hold_tap", name: "hml", param1: "LGUI", param2: "A" }, hold: null };
    expect(behaviorToString(key)).toBe("&hml LGUI A");
  });

  it("generates mod-morph chain in behaviors section", () => {
    const config: KeyboardConfig = {
      ...makeConfig([makeLayer("Base")]),
      modMorphs: [
        {
          id: randomUUID(),
          name: "mm_q_shift_qmark",
          defaultBinding: "&kp Q",
          morphBinding: "&kp QMARK",
          mods: ["MOD_LSFT", "MOD_RSFT"],
        },
      ],
    };
    const result = generateKeymap(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keymap).toContain("mm_q_shift_qmark: mm_q_shift_qmark {");
      expect(result.keymap).toContain("bindings = <&kp Q>, <&kp QMARK>;");
      expect(result.keymap).toContain("mods = <(MOD_LSFT|MOD_RSFT)>;");
    }
  });

  it("generates lt definition with quick-tap for layer-tap", () => {
    const keys = Array.from({ length: 80 }, () =>
      makeKey({ type: "trans" })
    );
    keys[0] = makeKey(
      { type: "kp", keyCode: "SPACE" },
      { type: "mo", layerIndex: 1 },
    );
    const config: KeyboardConfig = {
      ...makeConfig([makeLayer("Base"), makeLayer("Nav")]),
      holdTaps: [{
        id: randomUUID(),
        name: "lt",
        flavor: "balanced",
        tappingTermMs: 280,
        quickTapMs: 175,
        requirePriorIdleMs: 150,
        holdBinding: "&mo",
        tapBinding: "&kp",
      }],
    };
    config.layers[0]!.keys = keys;
    const result = generateKeymap(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keymap).toContain("&lt {");
      expect(result.keymap).not.toContain("lt: lt {");
      expect(result.keymap).toContain("quick-tap-ms = <175>");
      expect(result.keymap).toContain("&lt 1 SPACE");
    }
  });

  it("generates HRM hold-tap with mod-morph tapBinding", () => {
    const config: KeyboardConfig = {
      ...makeConfig([makeLayer("Base")]),
      holdTaps: [{
        id: randomUUID(),
        name: "hml_mm_q_shift_qmark",
        flavor: "balanced",
        tappingTermMs: 280,
        quickTapMs: 175,
        requirePriorIdleMs: 150,
        holdBinding: "&mod_activate",
        tapBinding: "&mm_q_shift_qmark",
        holdTriggerKeyPositions: [5, 6, 7],
        holdTriggerOnRelease: true,
      }],
    };
    const result = generateKeymap(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keymap).toContain("hml_mm_q_shift_qmark: hml_mm_q_shift_qmark {");
      expect(result.keymap).toContain("bindings = <&mod_activate>, <&mm_q_shift_qmark>;");
    }
  });
});
