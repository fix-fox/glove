import { describe, it, expect } from "vitest";
import { loadKeymap } from "./keymap-loader";

const config = loadKeymap().config;

describe("dictation key", () => {
  it("defines a dictation macro that double-taps Left-Control", () => {
    const macro = config.macros?.find((m) => m.name === "dictation");
    expect(macro).toBeDefined();
    expect(macro!.steps).toEqual([
      { directive: "tap", bindings: ["&kp LCTRL"] },
      { directive: "tap", bindings: ["&kp LCTRL"] },
    ]);
  });

  it("binds dictation on the Apps layer at position 69", () => {
    const apps = config.layers.find((l) => l.name === "Apps");
    expect(apps).toBeDefined();
    expect(apps!.keys[69]).toEqual({
      tap: { type: "macro", macroName: "dictation" },
      hold: null,
    });
  });

  it("keeps the hold-tap dictation target on the Enter thumb", () => {
    const def = config.holdTaps?.find((h) => h.name === "dict_enter");
    expect(def?.holdBinding).toBe("&dictation");
    expect(def?.tapBinding).toBe("&kp");
    expect(config.layers[0]!.keys[75]!.tap).toEqual({
      type: "hold_tap", name: "dict_enter", param1: "0", param2: "ENTER",
    });
  });
});
