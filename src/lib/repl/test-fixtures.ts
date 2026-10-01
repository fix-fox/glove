import type { Key, Keymap } from "../../types/keymap";

function noneKey(): Key {
  return { tap: { type: "none" }, hold: null };
}

function emptyKeys(): Key[] {
  return Array.from({ length: 80 }, noneKey);
}

/**
 * Minimal config for REPL tests. Notable bindings:
 * - default layer pos 0 (LC1): trans
 * - default layer pos 10 (LN1): kp F5, hold mo 1
 * - default layer pos 20 (RN5): kp C
 * - default layer pos 34 (LM1): hold_tap hml_lgui(LGUI, A)
 * - default layer pos 43 (RM4): kp LG(C)
 * Three layers so the prefix "sy" is ambiguous (symbols, system).
 */
export function makeConfig(): Keymap {
  const keys = emptyKeys();
  keys[0] = { tap: { type: "trans" }, hold: null };
  keys[10] = { tap: { type: "kp", keyCode: "F5" }, hold: { type: "mo", layerIndex: 1 } };
  keys[20] = { tap: { type: "kp", keyCode: "C" }, hold: null };
  keys[34] = { tap: { type: "hold_tap", name: "hml_lgui", param1: "LGUI", param2: "A" }, hold: null };
  keys[43] = { tap: { type: "kp", keyCode: "LG(C)" }, hold: null };
  return {
    layers: [
      { name: "default", keys },
      { name: "symbols", keys: emptyKeys() },
      { name: "system", keys: emptyKeys() },
    ],
    macros: [
      {
        name: "copy_url",
        label: "CopyURL",
        steps: [
          { directive: "tap", bindings: ["&kp LG(L)"] },
          { directive: "tap", bindings: ["&kp", "LG(C)"] },
        ],
      },
    ],
    combos: [
      {
        name: "esc_combo",
        keyPositions: [22, 23],
        binding: "&kp ESC",
      },
    ],
    modMorphs: [
      {
        name: "mm_bspc_shift_del",
        defaultBinding: "&kp BSPC",
        morphBinding: "&kp DEL",
        mods: ["MOD_LSFT"],
      },
    ],
    holdTaps: [
      {
        name: "hml_lgui",
        flavor: "balanced",
        tappingTermMs: 280,
        holdBinding: "&kp",
        tapBinding: "&kp",
      },
    ],
    conditionalLayers: [
      {
        name: "tri_layer",
        ifLayers: [1, 2],
        thenLayer: 2,
      },
    ],
  };
}
