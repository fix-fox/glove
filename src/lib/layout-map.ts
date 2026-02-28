/**
 * Maps Glove80 physical key positions to a 6x19 CSS grid.
 * Each cell is either a key index (0-79) or null (empty space).
 *
 * Row layout (matches ZMK keymap order):
 *   Row 1: 10 keys (5L + gap + 5R)
 *   Row 2: 12 keys (6L + gap + 6R)
 *   Row 3: 12 keys (6L + gap + 6R)
 *   Row 4: 12 keys (6L + gap + 6R)
 *   Row 5: 18 keys (9L + gap + 9R)
 *   Row 6: 16 keys (5L + 3L thumb + 3R thumb + 5R)
 */

export const GRID_COLS = 19;

type GridRow = readonly (number | null)[];

export const GLOVE80_GRID: readonly GridRow[] = [
  // Row 1: keys 0-9 (5L + 9 nulls + 5R)
  [0, 1, 2, 3, 4, null, null, null, null, null, null, null, null, null, 5, 6, 7, 8, 9],
  // Row 2: keys 10-21 (6L + 7 nulls + 6R)
  [10, 11, 12, 13, 14, 15, null, null, null, null, null, null, null, 16, 17, 18, 19, 20, 21],
  // Row 3: keys 22-33 (6L + 7 nulls + 6R)
  [22, 23, 24, 25, 26, 27, null, null, null, null, null, null, null, 28, 29, 30, 31, 32, 33],
  // Row 4: keys 34-45 (6L + 7 nulls + 6R)
  [34, 35, 36, 37, 38, 39, null, null, null, null, null, null, null, 40, 41, 42, 43, 44, 45],
  // Row 5: keys 46-51, 58-63 outer bottom row
  [46, 47, 48, 49, 50, 51, null, null, null, null, null, null, null, 58, 59, 60, 61, 62, 63],
  // Row 6: keys 64-68, 52-54, 55-57, 75-79
  [64, 65, 66, 67, 68, null, 52, 53, 54, null, 55, 56, 57, null, 75, 76, 77, 78, 79],
  // Row 7: keys 69-71, 72-74 thumb clusters
  [null, null, null, null, null, null, 69, 70, 71, null, 72, 73, 74, null, null, null, null, null, null],
] as const;

/**
 * Human-friendly position names for each key index (0-79).
 * Convention: Side (L/R) + Row letter + Column number.
 * Row letters: C=Ceiling, N=Number, T=Top, M=Middle, B=Bottom, F=Floor, H=tHumb.
 * Column 1 is always leftmost within each side.
 */
export const GLOVE80_KEY_NAMES: readonly string[] = [
  // Ceiling row (indices 0-9): 5L + 5R
  "LC1", "LC2", "LC3", "LC4", "LC5",
  "RC1", "RC2", "RC3", "RC4", "RC5",
  // Number row (indices 10-21): 6L + 6R
  "LN1", "LN2", "LN3", "LN4", "LN5", "LN6",
  "RN1", "RN2", "RN3", "RN4", "RN5", "RN6",
  // Top row (indices 22-33): 6L + 6R
  "LT1", "LT2", "LT3", "LT4", "LT5", "LT6",
  "RT1", "RT2", "RT3", "RT4", "RT5", "RT6",
  // Middle row (indices 34-45): 6L + 6R
  "LM1", "LM2", "LM3", "LM4", "LM5", "LM6",
  "RM1", "RM2", "RM3", "RM4", "RM5", "RM6",
  // Bottom row + Thumb upper (indices 46-63): 6L + 3LH + 3RH + 6R
  "LB1", "LB2", "LB3", "LB4", "LB5", "LB6",
  "LH1", "LH2", "LH3",
  "RH1", "RH2", "RH3",
  "RB1", "RB2", "RB3", "RB4", "RB5", "RB6",
  // Floor row + Thumb lower (indices 64-79): 5L + 3LH + 3RH + 5R
  "LF1", "LF2", "LF3", "LF4", "LF5",
  "LH4", "LH5", "LH6",
  "RH4", "RH5", "RH6",
  "RF1", "RF2", "RF3", "RF4", "RF5",
];
