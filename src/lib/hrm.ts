// =============================================================================
// HRM (Home Row Mod) utilities
// =============================================================================

/** Left-hand key positions on the Glove80. */
export const LEFT_HAND_POSITIONS: ReadonlySet<number> = new Set([
  0, 1, 2, 3, 4,
  10, 11, 12, 13, 14, 15,
  22, 23, 24, 25, 26, 27,
  34, 35, 36, 37, 38, 39,
  46, 47, 48, 49, 50, 51,
  52, 53, 54,
  64, 65, 66, 67, 68,
  69, 70, 71,
]);

/**
 * Trigger positions for left-hand HRM keys (right-hand + central thumb keys).
 * Keys on the left hand use these as hold-trigger-key-positions so that only
 * keys on the *opposite* side (and shared thumbs) can trigger the hold.
 */
export const LEFT_HRM_TRIGGER_POSITIONS: readonly number[] = [
  5, 6, 7, 8, 9,
  16, 17, 18, 19, 20, 21,
  28, 29, 30, 31, 32, 33,
  40, 41, 42, 43, 44, 45,
  52, 55, 56, 57, 58, 59, 60, 61, 62, 63,
  69, 72, 73, 74, 75, 76, 77, 78, 79,
];

/**
 * Trigger positions for right-hand HRM keys (left-hand + central thumb keys).
 */
export const RIGHT_HRM_TRIGGER_POSITIONS: readonly number[] = [
  0, 1, 2, 3, 4,
  10, 11, 12, 13, 14, 15,
  22, 23, 24, 25, 26, 27,
  34, 35, 36, 37, 38, 39,
  46, 47, 48, 49, 50, 51,
  52, 53, 54, 57,
  64, 65, 66, 67, 68,
  69, 70, 71, 74,
];

/** HRM default timing parameters. */
export const HRM_DEFAULTS = {
  flavor: "balanced" as const,
  tappingTermMs: 280,
  quickTapMs: 175,
  requirePriorIdleMs: 150,
};

export function isLeftHand(keyIndex: number): boolean {
  return LEFT_HAND_POSITIONS.has(keyIndex);
}

export function getHRMTriggerPositions(keyIndex: number): number[] {
  return isLeftHand(keyIndex)
    ? [...LEFT_HRM_TRIGGER_POSITIONS]
    : [...RIGHT_HRM_TRIGGER_POSITIONS];
}

export function hrmSide(keyIndex: number): "hml" | "hmr" {
  return isLeftHand(keyIndex) ? "hml" : "hmr";
}

/** ZMK modifier code → lowercase suffix for definition naming. */
export const MOD_SUFFIX_MAP: Record<string, string> = {
  LSHIFT: "lshift", RSHIFT: "rshift",
  LCTRL: "lctrl", RCTRL: "rctrl",
  LALT: "lalt", RALT: "ralt",
  LGUI: "lgui", RGUI: "rgui",
};

/** Lowercase suffix → ZMK modifier code. */
export const SUFFIX_TO_MOD: Record<string, string> = {
  lshift: "LSHIFT", rshift: "RSHIFT",
  lctrl: "LCTRL", rctrl: "RCTRL",
  lalt: "LALT", ralt: "RALT",
  lgui: "LGUI", rgui: "RGUI",
};

/** ZMK modifier code → display symbol. */
export const MOD_SYMBOL: Record<string, string> = {
  LSHIFT: "⇧", RSHIFT: "⇧",
  LCTRL: "⌃", RCTRL: "⌃",
  LALT: "⌥", RALT: "⌥",
  LGUI: "⌘", RGUI: "⌘",
};

/**
 * Map an abstract modifier type to a ZMK modifier code.
 * Always uses left-side modifiers (LSHIFT, LCTRL, etc.).
 */
export function inferModSide(modType: "shift" | "ctrl" | "alt" | "gui", _keyIndex: number): string {
  const map: Record<string, string> = {
    shift: "LSHIFT",
    ctrl: "LCTRL",
    alt: "LALT",
    gui: "LGUI",
  };
  return map[modType]!;
}

/**
 * Build a naming suffix from modifier codes.
 * ["LCTRL"] → "lctrl", ["LGUI", "LALT"] → "lgui_lalt"
 */
export function modSuffix(modCodes: string[]): string {
  return modCodes.map((c) => c.toLowerCase()).join("_");
}
