import type { Behavior, KeyboardConfig } from "../types/schema";
import { DEFAULT_LT_SETTINGS, DEFAULT_MOUSE_SETTINGS } from "../types/schema";

/**
 * Migrate raw parameterized mmv directions (e.g. "MOVE_Y(-300)") to the
 * structured { direction, precision } form.
 */
const RAW_MMV_PATTERN = /^MOVE_([XY])\((-?\d+)\)$/;
const RAW_TO_DIRECTION: Record<string, string> = {
  "Y_neg": "MOVE_UP",
  "Y_pos": "MOVE_DOWN",
  "X_neg": "MOVE_LEFT",
  "X_pos": "MOVE_RIGHT",
};

export function migrateRawMmv(config: KeyboardConfig): void {
  let detectedSpeed: number | undefined;
  for (const layer of config.layers) {
    for (const key of layer.keys) {
      for (const side of [key.tap, key.hold] as (Behavior | null)[]) {
        if (!side || side.type !== "mmv") continue;
        const m = RAW_MMV_PATTERN.exec(side.direction);
        if (!m) continue;
        const axis = m[1]!;
        const value = parseInt(m[2]!, 10);
        const sign = value < 0 ? "neg" : "pos";
        const mapped = RAW_TO_DIRECTION[`${axis}_${sign}`];
        if (mapped) {
          side.direction = mapped;
          side.precision = true;
          detectedSpeed = Math.abs(value);
        }
      }
    }
  }
  if (detectedSpeed !== undefined && !config.mouseSettings) {
    config.mouseSettings = {
      normalSpeed: DEFAULT_MOUSE_SETTINGS.normalSpeed,
      precisionSpeed: detectedSpeed,
    };
  }
}

/**
 * Migrate configs without ltSettings: set defaults and update existing
 * lt hold-tap definitions to use the lt defaults (prior idle = 0).
 */
export function migrateLtSettings(config: KeyboardConfig): void {
  if (config.ltSettings) return;
  config.ltSettings = { ...DEFAULT_LT_SETTINGS };
  const holdTaps = config.holdTaps;
  if (!holdTaps) return;
  for (const ht of holdTaps) {
    if (ht.name === "lt" || ht.name.startsWith("lt_")) {
      ht.flavor = DEFAULT_LT_SETTINGS.flavor;
      ht.tappingTermMs = DEFAULT_LT_SETTINGS.tappingTermMs;
      ht.quickTapMs = DEFAULT_LT_SETTINGS.quickTapMs;
      ht.requirePriorIdleMs = DEFAULT_LT_SETTINGS.requirePriorIdleMs;
    }
  }
}

/** Run all migrations on a config (mutates in-place). */
export function migrateConfig(config: KeyboardConfig): void {
  migrateRawMmv(config);
  migrateLtSettings(config);
}
