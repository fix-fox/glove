import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { KeyboardConfig } from "../types/schema";
import { migrateConfig } from "./migrations";

describe("migrateConfig mmv migration", () => {

  it("migrates raw MOVE_Y(-300) to precision MOVE_UP", () => {
    const config: KeyboardConfig = {
      name: "Test",
      version: 1,
      layers: [{
        id: randomUUID(),
        name: "Base",
        keys: Array.from({ length: 80 }, (_, i) =>
          i === 0
            ? { tap: { type: "mmv" as const, direction: "MOVE_Y(-300)" }, hold: null }
            : { tap: { type: "trans" as const }, hold: null },
        ),
      }],
    };
    migrateConfig(config);
    const key = config.layers[0]!.keys[0]!;
    expect(key.tap).toEqual({ type: "mmv", direction: "MOVE_UP", precision: true });
  });

  it("migrates raw MOVE_X(300) to precision MOVE_RIGHT", () => {
    const config: KeyboardConfig = {
      name: "Test",
      version: 1,
      layers: [{
        id: randomUUID(),
        name: "Base",
        keys: Array.from({ length: 80 }, (_, i) =>
          i === 0
            ? { tap: { type: "mmv" as const, direction: "MOVE_X(300)" }, hold: null }
            : { tap: { type: "trans" as const }, hold: null },
        ),
      }],
    };
    migrateConfig(config);
    const key = config.layers[0]!.keys[0]!;
    expect(key.tap).toEqual({ type: "mmv", direction: "MOVE_RIGHT", precision: true });
  });

  it("sets mouseSettings from migrated speed", () => {
    const config: KeyboardConfig = {
      name: "Test",
      version: 1,
      layers: [{
        id: randomUUID(),
        name: "Base",
        keys: Array.from({ length: 80 }, (_, i) =>
          i === 0
            ? { tap: { type: "mmv" as const, direction: "MOVE_Y(500)" }, hold: null }
            : { tap: { type: "trans" as const }, hold: null },
        ),
      }],
    };
    migrateConfig(config);
    expect(config.mouseSettings).toEqual({
      normalSpeed: 900,
      precisionSpeed: 500,
    });
  });

  it("does not migrate normal MOVE_UP direction", () => {
    const config: KeyboardConfig = {
      name: "Test",
      version: 1,
      layers: [{
        id: randomUUID(),
        name: "Base",
        keys: Array.from({ length: 80 }, (_, i) =>
          i === 0
            ? { tap: { type: "mmv" as const, direction: "MOVE_UP" }, hold: null }
            : { tap: { type: "trans" as const }, hold: null },
        ),
      }],
    };
    migrateConfig(config);
    const key = config.layers[0]!.keys[0]!;
    expect(key.tap).toEqual({ type: "mmv", direction: "MOVE_UP" });
    expect(config.mouseSettings).toBeUndefined();
  });
});
