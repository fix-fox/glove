import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { generateKeymap } from "./generator";
import { migrateConfig } from "./migrations";
import { KeyboardConfigSchema } from "../types/schema";

const config = KeyboardConfigSchema.parse(JSON.parse(readFileSync("config.json", "utf-8")));
migrateConfig(config);

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

  it("emits the macro and binding into the generated keymap", () => {
    const result = generateKeymap(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keymap).toContain("dictation: dictation {");
      expect(result.keymap).toContain("&macro_tap &kp LCTRL");
    }
  });
});
