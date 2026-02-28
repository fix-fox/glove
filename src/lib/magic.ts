/** Magic key positions on the Glove80 (LF1 and RF5). */
export const MAGIC_KEY_POSITIONS: ReadonlySet<number> = new Set([64, 79]);

export function isMagicPosition(index: number): boolean {
  return MAGIC_KEY_POSITIONS.has(index);
}
