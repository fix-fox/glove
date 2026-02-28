import type { Behavior, HoldTapDefinition, ModMorphDefinition } from "../types/schema";
import { ZMK_KEYCODES, isModifiedKeyCode, parseModifiedKeyCode } from "./keycodes";
import { unpackModMorphChain } from "./mod-morph-utils";

/** Override map: ZMK code -> display label. Checked before ZMK_KEYCODES lookup. */
const DISPLAY_OVERRIDES: Record<string, string> = {
  // Arrow keys — filled triangles; ▶/◀ get text-presentation selector to prevent emoji rendering
  UP: "▲", DOWN: "▼",
  LEFT: "◀\uFE0E", RIGHT: "▶\uFE0E",
  // Control keys — Unicode symbols
  BSPC: "⌫", DEL: "⌦", RET: "Enter", SPACE: "Space",
  // Control keys — shorter than ZMK_KEYCODES labels
  CAPS: "Caps",
  PG_UP: "PgUp", PG_DN: "PgDn", INS: "Ins",
  PSCRN: "PrtSc", SLCK: "ScrLk",
  // Standalone modifiers — Mac symbols (primary names)
  LSHIFT: "⇧", RSHIFT: "⇧R",
  LCTRL: "⌃", RCTRL: "⌃R",
  LALT: "⌥", RALT: "⌥R",
  LGUI: "⌘", RGUI: "⌘R",
  // Modifier aliases (ZMK alternate names)
  LEFT_SHIFT: "⇧", RIGHT_SHIFT: "⇧R", LSHFT: "⇧", RSHFT: "⇧R",
  LEFT_ALT: "⌥", RIGHT_ALT: "⌥R",
  LEFT_CTRL: "⌃", LEFT_CONTROL: "⌃", LCTL: "⌃",
  RIGHT_CTRL: "⌃R", RIGHT_CONTROL: "⌃R", RCTL: "⌃R",
  LEFT_GUI: "⌘", RIGHT_GUI: "⌘R",
  // Key aliases (ZMK alternate names for same physical keys)
  APOS: "'", PERIOD: ".", SLASH: "/", BSLASH: "\\",
  ESCAPE: "Esc", RETURN: "Enter", ENTER: "Enter",
  BACKSPACE: "⌫", DELETE: "⌦",
  // Shifted symbol aliases (ZMK named shifted keys)
  EXCLAMATION: "!", EXCL: "!",
  AT_SIGN: "@", AT: "@",
  HASH: "#", POUND: "#",
  DOLLAR: "$", DLLR: "$",
  PERCENT: "%", PRCNT: "%",
  CARET: "^",
  AMPS: "&", AMPERSAND: "&",
  STAR: "*", ASTERISK: "*",
  LEFT_PARENTHESIS: "(", LPAR: "(",
  RIGHT_PARENTHESIS: ")", RPAR: ")",
  UNDER: "_",
  PLUS: "+",
  LEFT_BRACE: "{", LBRC: "{",
  RIGHT_BRACE: "}", RBRC: "}",
  PIPE: "|",
  COLON: ":",
  DOUBLE_QUOTES: '"', DQT: '"',
  LESS_THAN: "<", LT: "<",
  GREATER_THAN: ">", GT: ">",
  QUESTION: "?", QMARK: "?",
  // Extra aliases
  NON_US_BSLH: "\\",
};

/** Modifier wrapper -> Mac symbol */
const MODIFIER_SYMBOLS: Record<string, string> = {
  LC: "⌃", RC: "⌃", LS: "⇧", RS: "⇧",
  LA: "⌥", RA: "⌥", LG: "⌘", RG: "⌘",
};

/** ZMK code -> label from ZMK_KEYCODES array */
const KEYCODE_LABEL_MAP: ReadonlyMap<string, string> = new Map(
  ZMK_KEYCODES.map((k) => [k.code, k.label]),
);

export function keyCodeDisplayLabel(code: string): string {
  // Check overrides first
  const override = DISPLAY_OVERRIDES[code];
  if (override !== undefined) return override;

  // Modified keys like LC(S), LA(LC(DEL))
  if (isModifiedKeyCode(code)) {
    const parsed = parseModifiedKeyCode(code);
    const modSymbols = parsed.mods.map((m) => MODIFIER_SYMBOLS[m] ?? m).join("");
    const baseLabel = keyCodeDisplayLabel(parsed.key);
    return `${modSymbols}${baseLabel}`;
  }

  // Lookup in ZMK_KEYCODES label map
  return KEYCODE_LABEL_MAP.get(code) ?? code;
}

/** Abbreviate a layer name to ≤5 chars for compact display on keys.
 *  Short names (≤5) keep their original case; longer names are stripped of
 *  underscores, uppercased, and truncated to 5 chars. */
function shortLayerName(nameOrIndex: string | number): string {
  const name = String(nameOrIndex);
  if (name.length <= 3) return name;
  return name.replace(/_/g, "").slice(0, 3).toUpperCase();
}

/**
 * Strip mod-morph suffix from a hold-tap name.
 * "hml_lctrl_mm_q_shift_qmark" → "hml_lctrl"
 */
function stripMorphSuffix(name: string): string {
  const mmIdx = name.indexOf("_mm_");
  return mmIdx !== -1 ? name.slice(0, mmIdx) : name;
}

/**
 * Infer the modifier symbol(s) from a hold-tap definition name.
 * e.g. "hml_lgui" → "⌘", "hml_lgui_lalt" → "⌘⌥"
 * Strips _mm_* suffix so mod-morph names don't bleed in.
 */
function inferModifierSymbol(name: string): string {
  const lower = stripMorphSuffix(name).toLowerCase();
  let result = "";
  if (lower.includes("gui")) result += "⌘";
  if (lower.includes("alt")) result += "⌥";
  if (lower.includes("ctrl")) result += "⌃";
  if (lower.includes("shift")) result += "⇧";
  return result || name.replace(/^(hml_|hmr_|mt_)/, "");
}

/** Returns true for home-row-mod definition names. */
export function isHRMName(name: string): boolean {
  return name === "hml" || name === "hmr" ||
    name.startsWith("hml_") || name.startsWith("hmr_");
}

/**
 * Resolve the tap label for an HRM hold-tap that might reference a mod-morph.
 * Looks up the definition's tapBinding; if it's a mod-morph, unpacks to get
 * the base keycode. Falls back to param2.
 */
function resolveHRMTapLabel(
  name: string,
  param2: string,
  holdTaps: HoldTapDefinition[],
  modMorphs: ModMorphDefinition[],
): string {
  const htDef = holdTaps.find((d) => d.name === name);
  if (htDef && htDef.tapBinding !== "&kp") {
    const mmName = htDef.tapBinding.replace(/^&/, "");
    const unpacked = unpackModMorphChain({ type: "mod_morph", name: mmName }, modMorphs);
    if (unpacked) return keyCodeDisplayLabel(unpacked.baseKeyCode);
  }
  return keyCodeDisplayLabel(param2);
}

/**
 * Primary display label for a hold_tap behavior on a key cap.
 * Shows the tap key for HRM/layer-tap, "magic-tap" for magic, etc.
 */
function holdTapTapLabel(
  name: string,
  param2: string,
  holdTaps: HoldTapDefinition[],
  modMorphs: ModMorphDefinition[],
): string {
  if (name === "magic") return "magic-tap";
  if (isHRMName(name) || name.startsWith("mt_")) {
    return resolveHRMTapLabel(name, param2, holdTaps, modMorphs);
  }
  if (name.startsWith("lt")) return keyCodeDisplayLabel(param2);
  return name;
}

/** Map a modifier keycode (possibly composed like LG(LALT)) to display symbols. */
function modifierKeyCodeSymbol(code: string): string {
  const MOD_SYMBOLS: Record<string, string> = {
    LGUI: "⌘", RGUI: "⌘", LALT: "⌥", RALT: "⌥",
    LCTRL: "⌃", RCTRL: "⌃", LSHIFT: "⇧", RSHIFT: "⇧",
  };
  if (isModifiedKeyCode(code)) {
    const parsed = parseModifiedKeyCode(code);
    const wrapperSymbols = parsed.mods.map((m) => MODIFIER_SYMBOLS[m] ?? m);
    const baseSymbol = MOD_SYMBOLS[parsed.key] ?? parsed.key;
    return [...new Set([...wrapperSymbols, baseSymbol])].join("");
  }
  return MOD_SYMBOLS[code] ?? code;
}

/**
 * Secondary (hold-side) display label for a hold_tap behavior on a key cap.
 * Shown below the primary tap label.
 */
export function holdTapSecondaryLabel(name: string, param1: string): string {
  if (name === "magic") return "magic-hold";
  if (isHRMName(name) || name.startsWith("mt_")) return modifierKeyCodeSymbol(param1);
  if (name.startsWith("lt")) return `◇${param1}`;
  return name;
}

export function behaviorLabel(
  behavior: Behavior,
  layerNames?: string[],
  modMorphs?: ModMorphDefinition[],
  holdTaps?: HoldTapDefinition[],
): string {
  const ln = (idx: number) => shortLayerName(layerNames?.[idx] ?? idx);
  switch (behavior.type) {
    case "kp":
      return keyCodeDisplayLabel(behavior.keyCode);
    case "mo":
      return `◇ ${ln(behavior.layerIndex)}`;
    case "to":
      return `⇨ ${ln(behavior.layerIndex)}`;
    case "sl":
      return `◆ ${ln(behavior.layerIndex)}`;
    case "trans":
      return "";
    case "none":
      return "";
    case "bootloader":
      return "BOOT";
    case "sys_reset":
      return "RESET";
    case "bt":
      if (behavior.action === "BT_SEL") {
        return `BT SEL ${behavior.profileIndex ?? 0}`;
      }
      if (behavior.action === "BT_CLR") return "BT CLR";
      if (behavior.action === "BT_NXT") return "BT NXT";
      return "BT PRV";
    case "tog":
      return `⇄ ${ln(behavior.layerIndex)}`;
    case "caps_word":
      return "CAPS";
    case "rgb_ug":
      return behavior.action;
    case "out":
      return behavior.action === "OUT_BLE" ? "BLE" : "USB";
    case "mmv":
      return behavior.direction.replace("MOVE_", "M_").replace("DOWN", "DN").replace("RIGHT", "RHT");
    case "msc":
      return behavior.direction.replace("SCRL_", "SC_").replace("DOWN", "DN").replace("RIGHT", "RHT");
    case "mkp":
      return behavior.button;
    case "macro":
      return behavior.macroName;
    case "mod_morph": {
      if (modMorphs) {
        const unpacked = unpackModMorphChain(behavior, modMorphs);
        if (unpacked) return keyCodeDisplayLabel(unpacked.baseKeyCode);
      }
      return behavior.name;
    }
    case "hold_tap":
      return holdTapTapLabel(behavior.name, behavior.param2, holdTaps ?? [], modMorphs ?? []);
  }
}
