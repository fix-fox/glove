let override: boolean | null = null;

/** Test/CLI hook: force colors on/off; null restores auto-detection. */
export function setColorEnabled(value: boolean | null): void {
  override = value;
}

export function colorEnabled(): boolean {
  if (override !== null) return override;
  return Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
}

function wrap(code: number, s: string): string {
  return colorEnabled() ? `\x1b[${code}m${s}\x1b[0m` : s;
}

export const bold = (s: string): string => wrap(1, s);
export const dim = (s: string): string => wrap(2, s);
export const red = (s: string): string => wrap(31, s);
export const green = (s: string): string => wrap(32, s);
export const yellow = (s: string): string => wrap(33, s);
export const magenta = (s: string): string => wrap(35, s);
export const cyan = (s: string): string => wrap(36, s);
