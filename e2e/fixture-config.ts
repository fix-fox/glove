/**
 * Minimal fixture config for screenshot tests.
 * Two layers, a handful of real keys, rest are trans/none.
 * Deterministic — no randomUUID, no dependency on saved config.
 */

import type { KeyboardConfig } from "../src/types/schema";

const kp = (keyCode: string) => ({ tap: { type: "kp" as const, keyCode }, hold: null });
const mo = (keyCode: string, layerIndex: number) => ({
  tap: { type: "kp" as const, keyCode },
  hold: { type: "mo" as const, layerIndex },
});
const none = { tap: { type: "none" as const }, hold: null };
const trans = { tap: { type: "trans" as const }, hold: null };

// 80 keys per layer. Fill with a recognizable pattern on Base.
function baseKeys() {
  const keys = Array.from({ length: 80 }, () => ({ ...none }));
  // Row 1: number row (indices 5-14 roughly, but use actual positions)
  // Just set a small cluster of keys for visual verification
  const qwerty = "QWERTYUIOP";
  for (let i = 0; i < qwerty.length; i++) {
    keys[i + 10] = kp(qwerty[i]!);
  }
  // Home row with some holds
  const home = "ASDFGHJKL";
  for (let i = 0; i < home.length; i++) {
    keys[i + 22] = i === 0 ? mo(home[i]!, 1) : kp(home[i]!);
  }
  // A few number keys
  for (let i = 1; i <= 5; i++) {
    keys[i + 4] = kp(`N${i}`);
  }
  return keys;
}

function overlayKeys() {
  const keys = Array.from({ length: 80 }, () => ({ ...trans }));
  // A few keys on the overlay layer
  keys[10] = kp("EXCL");
  keys[11] = kp("AT");
  keys[12] = kp("HASH");
  return keys;
}

export const fixtureConfig: KeyboardConfig = {
  name: "Test Layout",
  version: 1,
  layers: [
    { id: "00000000-0000-4000-8000-000000000001", name: "Base", keys: baseKeys() },
    { id: "00000000-0000-4000-8000-000000000002", name: "Symbols", keys: overlayKeys() },
  ],
  macros: [],
  modMorphs: [],
  holdTaps: [],
  combos: [],
  conditionalLayers: [],
};
