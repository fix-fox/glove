const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

function charWidth(cp: number): number {
  // Zero-width: variation selectors, ZWJ, combining marks
  if (cp === 0xfe0e || cp === 0xfe0f || cp === 0x200d) return 0;
  if (cp >= 0x0300 && cp <= 0x036f) return 0;
  // East Asian Wide / Fullwidth blocks + emoji — rendered 2 cells
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  ) {
    return 2;
  }
  // Everything else (incl. ⌘⌥⌃⇧, ▲▼◀▶, ◇◆⇄⇨, ·, ⌫⌦, Hebrew) — 1 cell in ghostty
  return 1;
}

export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of stripAnsi(s)) w += charWidth(ch.codePointAt(0)!);
  return w;
}

/** Truncate to a display-width budget, ending with `…`; ANSI codes pass through (reset appended). */
export function truncateDisplay(s: string, max: number): string {
  if (displayWidth(s) <= max) return s;
  let out = "";
  let w = 0;
  let i = 0;
  let sawAnsi = false;
  while (i < s.length) {
    const ansi = /^\x1b\[[0-9;]*m/.exec(s.slice(i));
    if (ansi) {
      out += ansi[0];
      sawAnsi = true;
      i += ansi[0].length;
      continue;
    }
    const cp = s.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const cw = charWidth(cp);
    if (w + cw > max - 1) break;
    out += ch;
    w += cw;
    i += ch.length;
  }
  return `${out}…${sawAnsi ? "\x1b[0m" : ""}`;
}

export function padDisplay(s: string, width: number): string {
  const pad = width - displayWidth(s);
  return pad > 0 ? s + " ".repeat(pad) : s;
}

/** Center within width; an odd leftover space goes to the right. */
export function padCenter(s: string, width: number): string {
  const pad = width - displayWidth(s);
  if (pad <= 0) return s;
  const left = Math.floor(pad / 2);
  return " ".repeat(left) + s + " ".repeat(pad - left);
}
