import { describe, it, expect } from "vitest";
import { generateRepo } from "./repo-generator";
import type { KeyboardConfig } from "../types/schema";
import { DEFAULT_KEY, GLOVE80_KEY_COUNT } from "../types/schema";

function makeConfig(overrides?: Partial<KeyboardConfig>): KeyboardConfig {
  return {
    name: "Test",
    version: 1,
    layers: [{
      id: "test-layer",
      name: "Base",
      keys: Array.from({ length: GLOVE80_KEY_COUNT }, () => ({ ...DEFAULT_KEY })),
    }],
    ...overrides,
  };
}

describe("generateRepo", () => {
  it("generates all required files", () => {
    const result = generateRepo(makeConfig());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const paths = result.files.map((f) => f.path);
    expect(paths).toContain(".github/workflows/build.yml");
    expect(paths).toContain("build.yaml");
    expect(paths).toContain("config/west.yml");
    expect(paths).toContain("config/glove80.keymap");
  });

  it("includes glove80.conf when pointing behaviors present", () => {
    const config = makeConfig();
    config.layers[0]!.keys[0] = {
      tap: { type: "mmv", direction: "MOVE_UP" },
      hold: null,
    };
    const result = generateRepo(config);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const conf = result.files.find((f) => f.path === "config/glove80.conf");
    expect(conf).toBeDefined();
    expect(conf!.content).toContain("CONFIG_ZMK_POINTING=y");
  });

  it("omits glove80.conf when no pointing behaviors", () => {
    const result = generateRepo(makeConfig());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const conf = result.files.find((f) => f.path === "config/glove80.conf");
    expect(conf).toBeUndefined();
  });

  it("returns errors on invalid config", () => {
    const config = makeConfig();
    // Create duplicate layer names to trigger validation error
    config.layers.push({
      id: "dup",
      name: "Base",
      keys: Array.from({ length: GLOVE80_KEY_COUNT }, () => ({ ...DEFAULT_KEY })),
    });
    const result = generateRepo(config);
    expect(result.ok).toBe(false);
  });

  it("build.yaml contains both glove80 halves", () => {
    const result = generateRepo(makeConfig());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const buildYaml = result.files.find((f) => f.path === "build.yaml");
    expect(buildYaml!.content).toContain("glove80_lh");
    expect(buildYaml!.content).toContain("glove80_rh");
  });

  it("west.yml references moergo zmk and urob helpers", () => {
    const result = generateRepo(makeConfig());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const west = result.files.find((f) => f.path === "config/west.yml");
    expect(west!.content).toContain("moergo-sc");
    expect(west!.content).toContain("urob");
    expect(west!.content).toContain("zmk-helpers");
  });
});
