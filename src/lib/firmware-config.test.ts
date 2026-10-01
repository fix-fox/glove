import { describe, expect, it } from "vitest";
import type { Behavior, KeyboardConfig } from "../types/schema";
import { DEFAULT_KEY, GLOVE80_KEY_COUNT } from "../types/schema";
import { generateConf, generateKeymap } from "./generator";

function makeConfig(): KeyboardConfig {
  return {
    name: "Test",
    version: 1,
    layers: [{
      id: crypto.randomUUID(),
      name: "Base",
      keys: Array.from({ length: GLOVE80_KEY_COUNT }, () => ({ ...DEFAULT_KEY })),
    }],
  };
}

describe("generateConf", () => {
  const pointingBehaviors: Behavior[] = [
    { type: "mmv", direction: "MOVE_UP" },
    { type: "msc", direction: "SCRL_DOWN" },
    { type: "mkp", button: "LCLK" },
  ];

  it.each(pointingBehaviors)("enables pointing for $type in either key slot", (behavior) => {
    for (const slot of ["tap", "hold"] as const) {
      const config = makeConfig();
      config.layers[0]!.keys[0]![slot] = behavior;
      expect(generateConf(config)).toBe("CONFIG_ZMK_POINTING=y\n");
    }
  });

  it("emits no configuration without pointing bindings", () => {
    expect(generateConf(makeConfig())).toBe("");
  });
});

describe("pointing keymap settings", () => {
  it("emits the configured normal mouse speed", () => {
    const config = makeConfig();
    config.mouseSettings = { normalSpeed: 600, precisionSpeed: 200 };
    config.layers[0]!.keys[0]!.tap = { type: "mmv", direction: "MOVE_UP" };
    const result = generateKeymap(config);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected a valid keymap");
    expect(result.keymap).toContain("#define ZMK_POINTING_DEFAULT_MOVE_VAL 600");
  });

  it("keeps the firmware default when no mouse settings are provided", () => {
    const config = makeConfig();
    config.layers[0]!.keys[0]!.tap = { type: "mmv", direction: "MOVE_UP" };
    const result = generateKeymap(config);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected a valid keymap");
    expect(result.keymap).not.toContain("ZMK_POINTING_DEFAULT_MOVE_VAL");
  });
});
