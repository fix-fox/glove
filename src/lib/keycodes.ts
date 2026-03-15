export interface ZmkKeycode {
  code: string;
  label: string;
  category: string;
}

export const ZMK_KEYCODES: ZmkKeycode[] = [
  // Letters
  { code: "A", label: "A", category: "Letters" },
  { code: "B", label: "B", category: "Letters" },
  { code: "C", label: "C", category: "Letters" },
  { code: "D", label: "D", category: "Letters" },
  { code: "E", label: "E", category: "Letters" },
  { code: "F", label: "F", category: "Letters" },
  { code: "G", label: "G", category: "Letters" },
  { code: "H", label: "H", category: "Letters" },
  { code: "I", label: "I", category: "Letters" },
  { code: "J", label: "J", category: "Letters" },
  { code: "K", label: "K", category: "Letters" },
  { code: "L", label: "L", category: "Letters" },
  { code: "M", label: "M", category: "Letters" },
  { code: "N", label: "N", category: "Letters" },
  { code: "O", label: "O", category: "Letters" },
  { code: "P", label: "P", category: "Letters" },
  { code: "Q", label: "Q", category: "Letters" },
  { code: "R", label: "R", category: "Letters" },
  { code: "S", label: "S", category: "Letters" },
  { code: "T", label: "T", category: "Letters" },
  { code: "U", label: "U", category: "Letters" },
  { code: "V", label: "V", category: "Letters" },
  { code: "W", label: "W", category: "Letters" },
  { code: "X", label: "X", category: "Letters" },
  { code: "Y", label: "Y", category: "Letters" },
  { code: "Z", label: "Z", category: "Letters" },

  // Numbers
  { code: "N1", label: "1", category: "Numbers" },
  { code: "N2", label: "2", category: "Numbers" },
  { code: "N3", label: "3", category: "Numbers" },
  { code: "N4", label: "4", category: "Numbers" },
  { code: "N5", label: "5", category: "Numbers" },
  { code: "N6", label: "6", category: "Numbers" },
  { code: "N7", label: "7", category: "Numbers" },
  { code: "N8", label: "8", category: "Numbers" },
  { code: "N9", label: "9", category: "Numbers" },
  { code: "N0", label: "0", category: "Numbers" },

  // Modifiers
  { code: "LSHIFT", label: "L Shift", category: "Modifiers" },
  { code: "RSHIFT", label: "R Shift", category: "Modifiers" },
  { code: "LCTRL", label: "L Ctrl", category: "Modifiers" },
  { code: "RCTRL", label: "R Ctrl", category: "Modifiers" },
  { code: "LALT", label: "L Alt", category: "Modifiers" },
  { code: "RALT", label: "R Alt", category: "Modifiers" },
  { code: "LGUI", label: "L GUI", category: "Modifiers" },
  { code: "RGUI", label: "R GUI", category: "Modifiers" },

  // Navigation
  { code: "UP", label: "Up", category: "Navigation" },
  { code: "DOWN", label: "Down", category: "Navigation" },
  { code: "LEFT", label: "Left", category: "Navigation" },
  { code: "RIGHT", label: "Right", category: "Navigation" },
  { code: "HOME", label: "Home", category: "Navigation" },
  { code: "END", label: "End", category: "Navigation" },
  { code: "PG_UP", label: "Page Up", category: "Navigation" },
  { code: "PG_DN", label: "Page Down", category: "Navigation" },

  // Punctuation
  { code: "MINUS", label: "-", category: "Punctuation" },
  { code: "EQUAL", label: "=", category: "Punctuation" },
  { code: "LBKT", label: "[", category: "Punctuation" },
  { code: "RBKT", label: "]", category: "Punctuation" },
  { code: "BSLH", label: "\\", category: "Punctuation" },
  { code: "SEMI", label: ";", category: "Punctuation" },
  { code: "SQT", label: "'", category: "Punctuation" },
  { code: "GRAVE", label: "`", category: "Punctuation" },
  { code: "COMMA", label: ",", category: "Punctuation" },
  { code: "DOT", label: ".", category: "Punctuation" },
  { code: "FSLH", label: "/", category: "Punctuation" },
  { code: "NON_US_HASH", label: "#", category: "Punctuation" },

  // Shifted Symbols
  { code: "EXCL", label: "!", category: "Shifted Symbols" },
  { code: "AT", label: "@", category: "Shifted Symbols" },
  { code: "HASH", label: "#", category: "Shifted Symbols" },
  { code: "DLLR", label: "$", category: "Shifted Symbols" },
  { code: "PRCNT", label: "%", category: "Shifted Symbols" },
  { code: "CARET", label: "^", category: "Shifted Symbols" },
  { code: "AMPS", label: "&", category: "Shifted Symbols" },
  { code: "STAR", label: "*", category: "Shifted Symbols" },
  { code: "LPAR", label: "(", category: "Shifted Symbols" },
  { code: "RPAR", label: ")", category: "Shifted Symbols" },
  { code: "UNDER", label: "_", category: "Shifted Symbols" },
  { code: "PLUS", label: "+", category: "Shifted Symbols" },
  { code: "LBRC", label: "{", category: "Shifted Symbols" },
  { code: "RBRC", label: "}", category: "Shifted Symbols" },
  { code: "PIPE", label: "|", category: "Shifted Symbols" },
  { code: "COLON", label: ":", category: "Shifted Symbols" },
  { code: "DQT", label: "\"", category: "Shifted Symbols" },
  { code: "TILDE", label: "~", category: "Shifted Symbols" },
  { code: "LT", label: "<", category: "Shifted Symbols" },
  { code: "GT", label: ">", category: "Shifted Symbols" },
  { code: "QMARK", label: "?", category: "Shifted Symbols" },

  // Control
  { code: "ESC", label: "Esc", category: "Control" },
  { code: "RET", label: "Enter", category: "Control" },
  { code: "SPACE", label: "Space", category: "Control" },
  { code: "TAB", label: "Tab", category: "Control" },
  { code: "BSPC", label: "Backspace", category: "Control" },
  { code: "DEL", label: "Delete", category: "Control" },
  { code: "INS", label: "Insert", category: "Control" },
  { code: "CAPS", label: "Caps Lock", category: "Control" },
  { code: "PSCRN", label: "Print Screen", category: "Control" },
  { code: "SLCK", label: "Scroll Lock", category: "Control" },
  { code: "PAUSE_BREAK", label: "Pause", category: "Control" },

  // Function keys
  { code: "F1", label: "F1", category: "Function" },
  { code: "F2", label: "F2", category: "Function" },
  { code: "F3", label: "F3", category: "Function" },
  { code: "F4", label: "F4", category: "Function" },
  { code: "F5", label: "F5", category: "Function" },
  { code: "F6", label: "F6", category: "Function" },
  { code: "F7", label: "F7", category: "Function" },
  { code: "F8", label: "F8", category: "Function" },
  { code: "F9", label: "F9", category: "Function" },
  { code: "F10", label: "F10", category: "Function" },
  { code: "F11", label: "F11", category: "Function" },
  { code: "F12", label: "F12", category: "Function" },
  { code: "F13", label: "F13", category: "Function" },
  { code: "F14", label: "F14", category: "Function" },
  { code: "F15", label: "F15", category: "Function" },
  { code: "F16", label: "F16", category: "Function" },
  { code: "F17", label: "F17", category: "Function" },
  { code: "F18", label: "F18", category: "Function" },
  { code: "F19", label: "F19", category: "Function" },
  { code: "F20", label: "F20", category: "Function" },
  { code: "F21", label: "F21", category: "Function" },
  { code: "F22", label: "F22", category: "Function" },
  { code: "F23", label: "F23", category: "Function" },
  { code: "F24", label: "F24", category: "Function" },

  // Keypad
  { code: "KP_N1", label: "KP 1", category: "Keypad" },
  { code: "KP_N2", label: "KP 2", category: "Keypad" },
  { code: "KP_N3", label: "KP 3", category: "Keypad" },
  { code: "KP_N4", label: "KP 4", category: "Keypad" },
  { code: "KP_N5", label: "KP 5", category: "Keypad" },
  { code: "KP_N6", label: "KP 6", category: "Keypad" },
  { code: "KP_N7", label: "KP 7", category: "Keypad" },
  { code: "KP_N8", label: "KP 8", category: "Keypad" },
  { code: "KP_N9", label: "KP 9", category: "Keypad" },
  { code: "KP_N0", label: "KP 0", category: "Keypad" },
  { code: "KP_DOT", label: "KP .", category: "Keypad" },
  { code: "KP_PLUS", label: "KP +", category: "Keypad" },
  { code: "KP_MINUS", label: "KP -", category: "Keypad" },
  { code: "KP_MULTIPLY", label: "KP *", category: "Keypad" },
  { code: "KP_DIVIDE", label: "KP /", category: "Keypad" },
  { code: "KP_ENTER", label: "KP Enter", category: "Keypad" },
  { code: "KP_EQUAL", label: "KP =", category: "Keypad" },

  // Media
  { code: "C_MUTE", label: "Mute", category: "Media" },
  { code: "C_VOL_UP", label: "Vol Up", category: "Media" },
  { code: "C_VOL_DN", label: "Vol Down", category: "Media" },
  { code: "C_PP", label: "Play/Pause", category: "Media" },
  { code: "C_NEXT", label: "Next", category: "Media" },
  { code: "C_PREV", label: "Previous", category: "Media" },
  { code: "C_STOP", label: "Stop", category: "Media" },
  { code: "C_BRI_UP", label: "Bright Up", category: "Media" },
  { code: "C_BRI_DN", label: "Bright Down", category: "Media" },
];

export const ZMK_MODIFIER_CODES = new Set([
  "LSHIFT", "RSHIFT", "LCTRL", "RCTRL", "LALT", "RALT", "LGUI", "RGUI",
]);

// =============================================================================
// Modified key codes — LC(S), LA(LC(V)), LS(FSLH), etc.
// =============================================================================

export const MODIFIER_WRAPPERS = ["LC", "RC", "LA", "RA", "LS", "RS", "LG", "RG"] as const;
export type ModifierWrapper = (typeof MODIFIER_WRAPPERS)[number];

export interface ParsedModifiedKey {
  key: string;
  mods: ModifierWrapper[];
}

export function parseModifiedKeyCode(code: string): ParsedModifiedKey {
  const mods: ModifierWrapper[] = [];
  let remaining = code;

  while (true) {
    const match = remaining.match(/^(LC|RC|LA|RA|LS|RS|LG|RG)\((.+)\)$/);
    if (!match) break;
    mods.push(match[1] as ModifierWrapper);
    remaining = match[2]!;
  }

  return { key: remaining, mods };
}

export function composeModifiedKeyCode(parsed: ParsedModifiedKey): string {
  let result = parsed.key;
  // Wrap from innermost to outermost (reverse order)
  for (let i = parsed.mods.length - 1; i >= 0; i--) {
    result = `${parsed.mods[i]}(${result})`;
  }
  return result;
}

export function isModifiedKeyCode(code: string): boolean {
  return /^(LC|RC|LA|RA|LS|RS|LG|RG)\(/.test(code);
}

export function searchKeycodes(query: string, keycodes: ZmkKeycode[] = ZMK_KEYCODES): ZmkKeycode[] {
  if (!query.trim()) return keycodes;
  const lower = query.toLowerCase();
  return keycodes.filter(
    (k) =>
      k.code.toLowerCase().includes(lower) ||
      k.label.toLowerCase().includes(lower) ||
      k.category.toLowerCase().includes(lower),
  );
}

/** Hebrew keycodes — QWERTY code mapped to Hebrew character via OS Hebrew layout.
 *  Kept separate from ZMK_KEYCODES to avoid polluting the default label map. */
export const HEBREW_KEYCODES: ZmkKeycode[] = [
  { code: "A", label: "\u05E9 shin", category: "Hebrew" },
  { code: "B", label: "\u05E0 nun", category: "Hebrew" },
  { code: "C", label: "\u05D1 bet", category: "Hebrew" },
  { code: "D", label: "\u05D2 gimel", category: "Hebrew" },
  { code: "E", label: "\u05E7 qof", category: "Hebrew" },
  { code: "F", label: "\u05DB kaf", category: "Hebrew" },
  { code: "G", label: "\u05E2 ayin", category: "Hebrew" },
  { code: "H", label: "\u05D9 yod", category: "Hebrew" },
  { code: "I", label: "\u05DF nun sofit", category: "Hebrew" },
  { code: "J", label: "\u05D7 het", category: "Hebrew" },
  { code: "K", label: "\u05DC lamed", category: "Hebrew" },
  { code: "L", label: "\u05DA kaf sofit", category: "Hebrew" },
  { code: "M", label: "\u05E6 tsade", category: "Hebrew" },
  { code: "N", label: "\u05DE mem", category: "Hebrew" },
  { code: "O", label: "\u05DD mem sofit", category: "Hebrew" },
  { code: "P", label: "\u05E4 pe", category: "Hebrew" },
  { code: "R", label: "\u05E8 resh", category: "Hebrew" },
  { code: "S", label: "\u05D3 dalet", category: "Hebrew" },
  { code: "T", label: "\u05D0 alef", category: "Hebrew" },
  { code: "U", label: "\u05D5 vav", category: "Hebrew" },
  { code: "V", label: "\u05D4 he", category: "Hebrew" },
  { code: "X", label: "\u05E1 samekh", category: "Hebrew" },
  { code: "Y", label: "\u05D8 tet", category: "Hebrew" },
  { code: "Z", label: "\u05D6 zayin", category: "Hebrew" },
  { code: "SEMI", label: "\u05E3 pe sofit", category: "Hebrew" },
  { code: "COMMA", label: "\u05EA tav", category: "Hebrew" },
  { code: "DOT", label: "\u05E5 tsade sofit", category: "Hebrew" },
  { code: "FSLH", label: ". (period-heb)", category: "Hebrew" },
  { code: "SQT", label: ", (comma-heb)", category: "Hebrew" },
];
