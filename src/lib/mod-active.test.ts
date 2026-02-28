import { describe, it, expect } from "vitest";
import type { KeyboardConfig, Layer } from "../types/schema";
import { DEFAULT_KEY, GLOVE80_KEY_COUNT } from "../types/schema";
import {
  ensureModActiveLayer,
  ensureModActivateMacro,
  ensureHRMDef,
  ensureLtDef,
  isModActiveLayer,
  isModMacro,
  isLtDef,
  isHRMDef,
  LT_DEF_NAME,
  MOD_ACTIVE_LAYER_NAME,
  MOD_ACTIVATE_MACRO_NAME,
  getEffectiveHrmSettings,
} from "./mod-active";

function makeLayer(name: string): Layer {
  return {
    id: crypto.randomUUID(),
    name,
    keys: Array.from({ length: GLOVE80_KEY_COUNT }, () => ({ ...DEFAULT_KEY })),
  };
}

function makeConfig(layers: Layer[]): KeyboardConfig {
  return {
    name: "Test",
    version: 1,
    layers,
    macros: [],
    modMorphs: [],
    holdTaps: [],
    combos: [],
    conditionalLayers: [],
  };
}

describe("isModActiveLayer", () => {
  it("returns true for mod_active layer", () => {
    expect(isModActiveLayer(makeLayer(MOD_ACTIVE_LAYER_NAME))).toBe(true);
  });

  it("returns false for other layers", () => {
    expect(isModActiveLayer(makeLayer("Base"))).toBe(false);
  });
});

describe("isModMacro", () => {
  it("returns true for mod_activate macro", () => {
    expect(isModMacro({ id: "x", name: MOD_ACTIVATE_MACRO_NAME, bindingCells: 1, steps: [{ directive: "param_1to1" }] })).toBe(true);
  });

  it("returns false for user macros", () => {
    expect(isModMacro({ id: "x", name: "my_macro", steps: [{ directive: "tap", bindings: ["&kp A"] }] })).toBe(false);
  });
});

describe("ensureModActiveLayer", () => {
  it("creates mod_active layer when not present", () => {
    const config = makeConfig([makeLayer("Base")]);
    const result = ensureModActiveLayer(config);
    expect(result.modActiveLayerIndex).toBe(1);
    expect(result.config.layers).toHaveLength(2);
    expect(result.config.layers[1]!.name).toBe(MOD_ACTIVE_LAYER_NAME);
  });

  it("finds existing mod_active layer", () => {
    const config = makeConfig([makeLayer("Base"), makeLayer(MOD_ACTIVE_LAYER_NAME)]);
    const result = ensureModActiveLayer(config);
    expect(result.modActiveLayerIndex).toBe(1);
    expect(result.config.layers).toHaveLength(2);
  });

  it("is idempotent", () => {
    const config = makeConfig([makeLayer("Base")]);
    const result1 = ensureModActiveLayer(config);
    const result2 = ensureModActiveLayer(result1.config);
    expect(result2.modActiveLayerIndex).toBe(1);
    expect(result2.config.layers).toHaveLength(2);
  });
});

describe("ensureModActivateMacro", () => {
  it("creates parameterized macro with zero timing", () => {
    const config = makeConfig([makeLayer("Base"), makeLayer(MOD_ACTIVE_LAYER_NAME)]);
    const result = ensureModActivateMacro(config, 1);
    const macro = result.macros!.find((m) => m.name === MOD_ACTIVATE_MACRO_NAME);
    expect(macro).toBeDefined();
    expect(macro!.bindingCells).toBe(1);
    expect(macro!.waitMs).toBe(0);
    expect(macro!.tapMs).toBe(0);
    expect(macro!.steps.some((s) => s.directive === "param_1to1")).toBe(true);
    expect(macro!.steps.some((s) => s.directive === "press")).toBe(true);
  });

  it("is idempotent", () => {
    const config = makeConfig([makeLayer("Base"), makeLayer(MOD_ACTIVE_LAYER_NAME)]);
    const result1 = ensureModActivateMacro(config, 1);
    const result2 = ensureModActivateMacro(result1, 1);
    expect(result2.macros!.filter((m) => m.name === MOD_ACTIVATE_MACRO_NAME)).toHaveLength(1);
  });
});

describe("ensureHRMDef", () => {
  it("creates shared HRM definition (hml)", () => {
    const config = makeConfig([makeLayer("Base")]);
    const result = ensureHRMDef(config, ["LSHIFT"], 34);
    expect(result.holdTapName).toBe("hml");
    expect(result.config.holdTaps).toHaveLength(1);
    const ht = result.config.holdTaps![0]!;
    expect(ht.flavor).toBe("balanced");
    expect(ht.tappingTermMs).toBe(280);
    expect(ht.tapBinding).toBe("&kp");
    expect(ht.holdBinding).toBe("&mod_activate");
    expect(ht.holdTriggerOnRelease).toBe(true);
    expect(ht.holdTriggerKeyPositions!.length).toBeGreaterThan(0);
  });

  it("creates unique HRM definition for mod-morph tap", () => {
    const config = makeConfig([makeLayer("Base")]);
    const result = ensureHRMDef(config, ["LCTRL"], 34, "&mm_q_shift_qmark");
    expect(result.holdTapName).toBe("hml_mm_q_shift_qmark");
    expect(result.config.holdTaps![0]!.tapBinding).toBe("&mm_q_shift_qmark");
  });

  it("creates right-hand HRM for right-hand key", () => {
    const config = makeConfig([makeLayer("Base")]);
    const result = ensureHRMDef(config, ["RCTRL"], 40);
    expect(result.holdTapName).toBe("hmr");
  });

  it("shares definition across modifiers on same side", () => {
    const config = makeConfig([makeLayer("Base")]);
    const result1 = ensureHRMDef(config, ["LSHIFT"], 34);
    const result2 = ensureHRMDef(result1.config, ["LGUI"], 34);
    expect(result2.holdTapName).toBe("hml");
    expect(result2.config.holdTaps).toHaveLength(1); // shared, not duplicated
  });

  it("uses custom hrmSettings when present", () => {
    const config: KeyboardConfig = {
      ...makeConfig([makeLayer("Base")]),
      hrmSettings: {
        flavor: "tap-preferred",
        tappingTermMs: 200,
        quickTapMs: 100,
        requirePriorIdleMs: 50,
      },
    };
    const result = ensureHRMDef(config, ["LSHIFT"], 34);
    const ht = result.config.holdTaps![0]!;
    expect(ht.flavor).toBe("tap-preferred");
    expect(ht.tappingTermMs).toBe(200);
    expect(ht.quickTapMs).toBe(100);
    expect(ht.requirePriorIdleMs).toBe(50);
  });
});

describe("isHRMDef", () => {
  it("returns true for hml/hmr", () => {
    expect(isHRMDef({ id: "x", name: "hml", flavor: "balanced", tappingTermMs: 280, holdBinding: "&mod_activate", tapBinding: "&kp" })).toBe(true);
    expect(isHRMDef({ id: "x", name: "hmr", flavor: "balanced", tappingTermMs: 280, holdBinding: "&mod_activate", tapBinding: "&kp" })).toBe(true);
  });

  it("returns true for mod-morph variants", () => {
    expect(isHRMDef({ id: "x", name: "hml_mm_q", flavor: "balanced", tappingTermMs: 280, holdBinding: "&mod_activate", tapBinding: "&mm_q" })).toBe(true);
  });

  it("returns false for other definitions", () => {
    expect(isHRMDef({ id: "x", name: "lt", flavor: "balanced", tappingTermMs: 280, holdBinding: "&mo", tapBinding: "&kp" })).toBe(false);
  });
});

describe("ensureLtDef", () => {
  it("creates lt definition when not present", () => {
    const config = makeConfig([makeLayer("Base")]);
    const result = ensureLtDef(config);
    expect(result.holdTaps).toHaveLength(1);
    const ht = result.holdTaps![0]!;
    expect(ht.name).toBe(LT_DEF_NAME);
    expect(ht.holdBinding).toBe("&mo");
    expect(ht.tapBinding).toBe("&kp");
    expect(ht.flavor).toBe("balanced");
    expect(ht.quickTapMs).toBe(175);
  });

  it("is idempotent", () => {
    const config = makeConfig([makeLayer("Base")]);
    const result1 = ensureLtDef(config);
    const result2 = ensureLtDef(result1);
    expect(result2.holdTaps).toHaveLength(1);
  });

  it("uses custom hrmSettings when present", () => {
    const config: KeyboardConfig = {
      ...makeConfig([makeLayer("Base")]),
      hrmSettings: {
        flavor: "hold-preferred",
        tappingTermMs: 300,
        quickTapMs: 200,
        requirePriorIdleMs: 100,
      },
    };
    const result = ensureLtDef(config);
    const ht = result.holdTaps![0]!;
    expect(ht.flavor).toBe("hold-preferred");
    expect(ht.tappingTermMs).toBe(300);
  });
});

describe("isLtDef", () => {
  it("returns true for lt definition", () => {
    expect(isLtDef({ id: "x", name: "lt", flavor: "balanced", tappingTermMs: 280, holdBinding: "&mo", tapBinding: "&kp" })).toBe(true);
  });

  it("returns false for other definitions", () => {
    expect(isLtDef({ id: "x", name: "hml", flavor: "balanced", tappingTermMs: 280, holdBinding: "&mod_activate", tapBinding: "&kp" })).toBe(false);
  });
});

describe("getEffectiveHrmSettings", () => {
  it("returns defaults when hrmSettings is undefined", () => {
    const config = makeConfig([makeLayer("Base")]);
    const settings = getEffectiveHrmSettings(config);
    expect(settings.flavor).toBe("balanced");
    expect(settings.tappingTermMs).toBe(280);
    expect(settings.quickTapMs).toBe(175);
    expect(settings.requirePriorIdleMs).toBe(150);
  });

  it("returns custom settings when present", () => {
    const config: KeyboardConfig = {
      ...makeConfig([makeLayer("Base")]),
      hrmSettings: {
        flavor: "tap-preferred",
        tappingTermMs: 200,
        quickTapMs: 100,
        requirePriorIdleMs: 50,
      },
    };
    const settings = getEffectiveHrmSettings(config);
    expect(settings.flavor).toBe("tap-preferred");
    expect(settings.tappingTermMs).toBe(200);
  });
});
