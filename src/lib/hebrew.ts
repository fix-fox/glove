/**
 * QWERTY keycode → Hebrew character mapping.
 * Based on the standard Windows/Linux Hebrew keyboard layout:
 * when the OS is set to Hebrew input, these QWERTY keycodes produce
 * the corresponding Hebrew characters.
 */
export const QWERTY_TO_HEBREW: Record<string, string> = {
  Q: "/", W: "\u05F3", // geresh
  E: "\u05E7", // ק qof
  R: "\u05E8", // ר resh
  T: "\u05D0", // א alef
  Y: "\u05D8", // ט tet
  U: "\u05D5", // ו vav
  I: "\u05DF", // ן nun sofit
  O: "\u05DD", // ם mem sofit
  P: "\u05E4", // פ pe
  A: "\u05E9", // ש shin
  S: "\u05D3", // ד dalet
  D: "\u05D2", // ג gimel
  F: "\u05DB", // כ kaf
  G: "\u05E2", // ע ayin
  H: "\u05D9", // י yod
  J: "\u05D7", // ח het
  K: "\u05DC", // ל lamed
  L: "\u05DA", // ך kaf sofit
  SEMI: "\u05E3", // ף pe sofit
  APOS: ",",
  Z: "\u05D6", // ז zayin
  X: "\u05E1", // ס samekh
  C: "\u05D1", // ב bet
  V: "\u05D4", // ה he
  B: "\u05E0", // נ nun
  N: "\u05DE", // מ mem
  M: "\u05E6", // צ tsade
  COMMA: "\u05EA", // ת tav
  PERIOD: "\u05E5", // ץ tsade sofit
  SLASH: ".",
};

/** Returns the Hebrew character for a QWERTY keycode, or undefined if not mapped. */
export function hebrewLabel(code: string): string | undefined {
  return QWERTY_TO_HEBREW[code];
}
