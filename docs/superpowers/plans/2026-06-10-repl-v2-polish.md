# REPL v2 Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Boxed/aligned colored layer rendering, smarter 3-tier `find`, global `glove` command, no deprecation warning, ANSI-16 theme colors.

**Architecture:** New small modules in `src/lib/repl/` (`text-width.ts`, `color.ts`, `find-aliases.ts`); `renderLayer` rewritten around display-width-aware boxed cells; `dispatch` find arm becomes 3 tiers (keycode → alias → text search); shell gains colored prompt and spacing. Alignment guarded by a test over every layer of the real `config.json`.

**Tech Stack:** TypeScript (strict: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), vitest, ANSI-16 escapes (zero deps), tsx via `node --import`.

**Spec:** `docs/superpowers/specs/2026-06-10-repl-v2-polish-design.md`

**Conventions for every task:** work in the worktree (verify `git rev-parse --show-toplevel` = `/Users/harelf/glove/.claude/worktrees/strange-sammet-7eaf33`); `npx tsc --noEmit` must be clean before each commit; imports within `src/lib/repl/` are relative (`../layout-map`, `../../types/schema`).

## File structure

| File | Responsibility |
|---|---|
| `src/lib/repl/text-width.ts` (+test) | ANSI-strip, display width, pad/center/truncate |
| `src/lib/repl/color.ts` (+test) | ANSI-16 helpers, TTY/NO_COLOR gate, test override |
| `src/lib/repl/find-aliases.ts` (+test) | concept → keycode-query alias table (seeded from docs/MAC_SETUP.md §7) |
| `src/lib/repl/query.ts` (+test) | add `textSearch` fallback |
| `src/lib/repl/render.ts` (+tests) | boxed `renderLayer`, legend, cell colors |
| `src/lib/repl/render.alignment.test.ts` | all real-config layers stay aligned |
| `src/lib/repl/dispatch.ts` (+test) | 3-tier find, aligned/colored find output |
| `src/lib/repl/complete.ts` (+test) | alias concepts complete after `find` |
| `scripts/repl.ts`, `package.json` | no-deprecation invocation, prompt color, spacing |
| `scripts/glove` | global launcher (symlink → `~/.local/bin/glove`, tracked in dotfiles) |

---

### Task 1: Display-width utilities (`text-width.ts`)

**Files:**
- Create: `src/lib/repl/text-width.ts`
- Test: `src/lib/repl/text-width.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/repl/text-width.test.ts
import { describe, it, expect } from "vitest";
import { displayWidth, padDisplay, padCenter, truncateDisplay, stripAnsi } from "./text-width";

describe("displayWidth", () => {
  it("counts plain ASCII", () => {
    expect(displayWidth("abc")).toBe(3);
  });

  it("strips ANSI escapes", () => {
    expect(displayWidth("[36mabc[0m")).toBe(3);
  });

  it("ignores variation selectors", () => {
    expect(displayWidth("▶︎")).toBe(1); // arrow + text-presentation selector
  });

  it("counts Mac symbols and geometric shapes as width 1", () => {
    expect(displayWidth("⌘⌥⌃⇧")).toBe(4);
    expect(displayWidth("◇⇄⇨◆·")).toBe(5);
    expect(displayWidth("A·⌘")).toBe(3);
  });

  it("counts CJK/fullwidth/emoji as width 2", () => {
    expect(displayWidth("中")).toBe(2);
    expect(displayWidth("😀")).toBe(2);
  });

  it("counts Hebrew as width 1", () => {
    expect(displayWidth("שלום")).toBe(4);
  });
});

describe("padDisplay / padCenter", () => {
  it("pads to display width, not string length", () => {
    expect(padDisplay("⌘C", 5)).toBe("⌘C   ");
    expect(padCenter("⌘C", 6)).toBe("  ⌘C  ");
  });

  it("centers with the extra space on the right", () => {
    expect(padCenter("ab", 5)).toBe(" ab  ");
  });

  it("returns the string unchanged when already at width", () => {
    expect(padDisplay("abcde", 5)).toBe("abcde");
  });
});

describe("truncateDisplay", () => {
  it("returns short strings unchanged", () => {
    expect(truncateDisplay("abc", 6)).toBe("abc");
  });

  it("truncates with an ellipsis at the display-width budget", () => {
    expect(truncateDisplay("RGB_STATUS", 6)).toBe("RGB_S…");
  });

  it("accounts for wide chars when truncating", () => {
    expect(truncateDisplay("中中中中", 5)).toBe("中中…"); // 2+2+1 = 5
  });
});

describe("stripAnsi", () => {
  it("removes SGR sequences", () => {
    expect(stripAnsi("[1m[36mhi[0m")).toBe("hi");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/repl/text-width.test.ts`
Expected: FAIL — cannot resolve `./text-width`.

- [ ] **Step 3: Implement**

```ts
// src/lib/repl/text-width.ts
const ANSI_RE = /\[[0-9;]*m/g;

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

/** Truncate plain (ANSI-free) text to a display-width budget, ending with `…`. */
export function truncateDisplay(s: string, max: number): string {
  if (displayWidth(s) <= max) return s;
  let out = "";
  let w = 0;
  for (const ch of s) {
    const cw = charWidth(ch.codePointAt(0)!);
    if (w + cw > max - 1) break;
    out += ch;
    w += cw;
  }
  return `${out}…`;
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/repl/text-width.test.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repl/text-width.ts src/lib/repl/text-width.test.ts
git commit -m "feat(repl): display-width-aware text utilities"
```

---

### Task 2: ANSI color helpers (`color.ts`)

**Files:**
- Create: `src/lib/repl/color.ts`
- Test: `src/lib/repl/color.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/repl/color.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { bold, cyan, dim, setColorEnabled } from "./color";

afterEach(() => setColorEnabled(null));

describe("color helpers", () => {
  it("are plain text when disabled", () => {
    setColorEnabled(false);
    expect(cyan("hi")).toBe("hi");
    expect(bold("hi")).toBe("hi");
  });

  it("wrap with SGR codes when enabled", () => {
    setColorEnabled(true);
    expect(cyan("hi")).toBe("[36mhi[0m");
    expect(bold("hi")).toBe("[1mhi[0m");
    expect(dim("hi")).toBe("[2mhi[0m");
  });

  it("auto-detection is off in a non-TTY test run", () => {
    // override cleared by afterEach; vitest runs without a TTY
    expect(cyan("hi")).toBe("hi");
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — `npx vitest run src/lib/repl/color.test.ts` (cannot resolve `./color`).

- [ ] **Step 3: Implement**

```ts
// src/lib/repl/color.ts
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
  return colorEnabled() ? `[${code}m${s}[0m` : s;
}

export const bold = (s: string): string => wrap(1, s);
export const dim = (s: string): string => wrap(2, s);
export const red = (s: string): string => wrap(31, s);
export const green = (s: string): string => wrap(32, s);
export const yellow = (s: string): string => wrap(33, s);
export const magenta = (s: string): string => wrap(35, s);
export const cyan = (s: string): string => wrap(36, s);
```

- [ ] **Step 4: Verify** — tests PASS, `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repl/color.ts src/lib/repl/color.test.ts
git commit -m "feat(repl): ANSI-16 color helpers with TTY/NO_COLOR gate"
```

---

### Task 3: No-deprecation invocation + `glove` launcher

**Files:**
- Modify: `package.json` (scripts.repl)
- Create: `scripts/glove` (executable)
- Outside repo: `~/.local/bin/glove` symlink + dotfiles tracking

- [ ] **Step 1: Change the npm script**

In `package.json`: `"repl": "tsx scripts/repl.ts"` → `"repl": "node --no-deprecation --import=tsx scripts/repl.ts"`.

- [ ] **Step 2: Verify the warning is gone**

Run: `npm run repl --silent -- layers 2>&1 | grep -c DEP0205` → expect `0` (and layers print).

- [ ] **Step 3: Create `scripts/glove`**

```bash
#!/bin/bash
# Global launcher for the Glove80 keymap REPL.
# Install: ln -sf ~/glove/scripts/glove ~/.local/bin/glove
cd "$(dirname "$(readlink -f "$0")")/.." || exit 1
exec node --no-deprecation --import=tsx scripts/repl.ts "$@"
```

Then: `chmod +x scripts/glove`.

- [ ] **Step 4: Install the symlink and verify from outside the repo**

```bash
ln -sf /Users/harelf/glove/scripts/glove ~/.local/bin/glove
cd /tmp && glove layers | head -3 && glove help | head -2
```

Expected: layer list and help, exit 0, no warning. (Note: the symlink targets the MAIN repo path, which is correct for permanent installation — the repo file resolves there after merge. During pre-merge verification, `glove` runs the v1 code at main; that is fine, just confirm it launches.)

- [ ] **Step 5: Track in dotfiles**

The dotfiles bare repo is `~/.mac-dotfiles` with an allowlist `~/.gitignore` (see user CLAUDE.md). Run:

```bash
DOT="git --git-dir=$HOME/.mac-dotfiles --work-tree=$HOME"
grep -n "local/bin" ~/.gitignore   # inspect existing allowlist rules
```

Mirror the existing `.local/bin` pattern: if a rule like `!.local/bin/bm` exists, append `!.local/bin/glove` next to it (and parent `!`-rules only if not already present). Then:

```bash
$DOT add ~/.gitignore ~/.local/bin/glove
$DOT commit -m "track glove REPL launcher symlink"
$DOT push
```

If the allowlist structure looks different from expected, STOP and report DONE_WITH_CONCERNS describing what you found instead of guessing.

- [ ] **Step 6: Commit (repo side)**

```bash
git add package.json scripts/glove
git commit -m "feat(repl): glove global launcher and warning-free invocation"
```

---

### Task 4: Find alias table (`find-aliases.ts`)

**Files:**
- Create: `src/lib/repl/find-aliases.ts`
- Test: `src/lib/repl/find-aliases.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/repl/find-aliases.test.ts
import { describe, it, expect } from "vitest";
import { FIND_ALIASES, lookupAlias } from "./find-aliases";
import { parseFindQuery } from "./query";

describe("find aliases", () => {
  it("resolves screenshot to the macOS chords", () => {
    const alias = lookupAlias("screenshot");
    expect(alias).toBeDefined();
    expect(alias!.queries).toContain("LG(LS(N5))");
    expect(alias!.queries).toContain("LG(LS(N4))");
    expect(alias!.hint).toContain("⌘⇧5");
  });

  it("is case-insensitive and trims", () => {
    expect(lookupAlias(" Screenshot ")).toBe(FIND_ALIASES.screenshot);
  });

  it("returns undefined for unknown concepts", () => {
    expect(lookupAlias("frobnicate")).toBeUndefined();
  });

  it("every alias query parses as a find query", () => {
    for (const [name, alias] of Object.entries(FIND_ALIASES)) {
      for (const q of alias.queries) {
        expect(parseFindQuery(q), `${name}: ${q}`).not.toBeNull();
      }
    }
  });
});
```

- [ ] **Step 2: Run to verify FAIL.** `npx vitest run src/lib/repl/find-aliases.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/repl/find-aliases.ts

/**
 * Concept → keycode-query aliases for `find`.
 * Mac-specific chords are seeded from docs/MAC_SETUP.md §7 (special keys) —
 * keep this table in sync when that doc changes.
 */
export interface FindAlias {
  queries: string[]; // each must be parseFindQuery-compatible
  hint: string; // shown to the user when the alias expands
}

export const FIND_ALIASES: Record<string, FindAlias> = {
  screenshot: {
    queries: ["LG(LS(N5))", "LG(LS(N4))", "LG(LS(N3))", "PSCRN"],
    hint: "⌘⇧5 menu / ⌘⇧4 region / ⌘⇧3 full / PrtSc",
  },
  lock: { queries: ["LC(LG(Q))"], hint: "⌃⌘Q" },
  emoji: { queries: ["LC(LG(SPACE))"], hint: "⌃⌘Space" },
  launcher: { queries: ["LA(SPACE)"], hint: "⌥Space" },
  clipboard: { queries: ["LA(LS(V))"], hint: "⌥⇧V (Maccy)" },
  alttab: { queries: ["LA(TAB)"], hint: "⌥Tab" },
  lang: { queries: ["LC(SPACE)"], hint: "⌃Space input-source switch" },
  copy: { queries: ["LG(C)"], hint: "⌘C" },
  paste: { queries: ["LG(V)"], hint: "⌘V" },
  cut: { queries: ["LG(X)"], hint: "⌘X" },
  undo: { queries: ["LG(Z)"], hint: "⌘Z" },
  redo: { queries: ["LS(LG(Z))"], hint: "⌘⇧Z" },
  save: { queries: ["LG(S)"], hint: "⌘S" },
  newtab: { queries: ["LG(T)"], hint: "⌘T" },
  close: { queries: ["LG(W)"], hint: "⌘W" },
};

export function lookupAlias(query: string): FindAlias | undefined {
  return FIND_ALIASES[query.trim().toLowerCase()];
}
```

- [ ] **Step 4: Verify** — tests PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repl/find-aliases.ts src/lib/repl/find-aliases.test.ts
git commit -m "feat(repl): concept alias table for find (seeded from MAC_SETUP)"
```

---

### Task 5: Text-search fallback (`query.ts`)

**Files:**
- Modify: `src/lib/repl/query.ts` (append)
- Test: `src/lib/repl/query.test.ts` (append)

- [ ] **Step 1: Append failing tests** (extend the `./query` import with `textSearch`)

```ts
describe("textSearch", () => {
  const config = makeConfig();

  it("matches macro names and labels case-insensitively", () => {
    const byName = textSearch(config, "copy_u");
    expect(byName.some((r) => r.entity.includes('macro "copy_url"'))).toBe(true);
    const byLabel = textSearch(config, "copyurl");
    expect(byLabel.some((r) => r.entity.includes("copy_url"))).toBe(true);
  });

  it("matches combo, mod-morph, hold-tap, and layer names", () => {
    expect(textSearch(config, "esc_co")[0]!.entity).toContain('combo "esc_combo"');
    expect(textSearch(config, "bspc_shift")[0]!.entity).toContain("mm_bspc_shift_del");
    expect(textSearch(config, "hml_")[0]!.entity).toContain("hml_lgui");
    expect(textSearch(config, "symb")[0]!.entity).toContain('layer 1 "symbols"');
  });

  it("matches keycode labels and reverse-finds their bindings", () => {
    // fixture pos 10 is F5; ZMK label for F5 is "F5" — use a label-only term instead:
    // BSPC has label "Backspace" and appears in the fixture mod-morph default binding
    const results = textSearch(config, "backsp");
    const kc = results.find((r) => r.entity.includes("keycode BSPC"));
    expect(kc).toBeDefined();
    expect(kc!.matches.some((m) => m.location.includes("mm_bspc_shift_del"))).toBe(true);
  });

  it("requires at least 2 characters and returns [] for blank", () => {
    expect(textSearch(config, "")).toEqual([]);
    expect(textSearch(config, "a")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify the new tests FAIL.**

- [ ] **Step 3: Append implementation to `query.ts`** (add `ZMK_KEYCODES` to the `../keycodes` import)

```ts
export interface TextSearchResult {
  entity: string; // e.g. `macro "copy_url" (CopyURL)` or `keycode BSPC "Backspace"`
  matches: FindMatch[]; // bindings (populated for keycode hits; [] for entity hits)
}

/**
 * Fallback for `find`: case-insensitive substring search over entity names,
 * labels, layer names, and ZMK keycode labels (which are then reverse-found).
 * Queries shorter than 2 chars return nothing (too noisy).
 */
export function textSearch(config: KeyboardConfig, query: string): TextSearchResult[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const hit = (s: string | undefined): boolean =>
    s !== undefined && s.toLowerCase().includes(q);
  const results: TextSearchResult[] = [];

  for (const m of config.macros ?? []) {
    if (hit(m.name) || hit(m.label)) {
      results.push({ entity: `macro "${m.name}"${m.label ? ` (${m.label})` : ""}`, matches: [] });
    }
  }
  for (const c of config.combos ?? []) {
    if (hit(c.name)) results.push({ entity: `combo "${c.name}"`, matches: [] });
  }
  for (const mm of config.modMorphs ?? []) {
    if (hit(mm.name) || hit(mm.label)) results.push({ entity: `mod-morph "${mm.name}"`, matches: [] });
  }
  for (const ht of config.holdTaps ?? []) {
    if (hit(ht.name) || hit(ht.label)) results.push({ entity: `hold-tap "${ht.name}"`, matches: [] });
  }
  config.layers.forEach((layer, i) => {
    if (hit(layer.name)) results.push({ entity: `layer ${i} "${layer.name}"`, matches: [] });
  });
  for (const kc of ZMK_KEYCODES) {
    if (kc.label.toLowerCase().includes(q) && kc.label.toLowerCase() !== kc.code.toLowerCase()) {
      const matches = findBindings(config, { mods: [], key: kc.code });
      if (matches.length > 0) {
        results.push({ entity: `keycode ${kc.code} "${kc.label}"`, matches });
      }
    }
  }
  return results;
}
```

- [ ] **Step 4: Verify** — `npx vitest run src/lib/repl/query.test.ts` all PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repl/query.ts src/lib/repl/query.test.ts
git commit -m "feat(repl): text-search fallback over names, labels, and keycode labels"
```

---

### Task 6: Boxed layer rendering (`render.ts`)

**Files:**
- Modify: `src/lib/repl/render.ts` (replace `CELL_WIDTH`/`cellLabel`/`renderLayer`; keep everything else)
- Test: `src/lib/repl/render.test.ts` (replace the `renderLayer` describe block)

- [ ] **Step 1: Replace the `renderLayer` tests** (delete the old `describe("renderLayer", ...)` block; add)

```ts
// new imports at top of render.test.ts:
// import { beforeAll } from "vitest";
// import { setColorEnabled } from "./color";
// import { displayWidth, stripAnsi } from "./text-width";

beforeAll(() => setColorEnabled(false));

describe("renderLayer (boxed)", () => {
  it("renders a header and one box per key", () => {
    const text = renderLayer(config, 0);
    const lines = text.split("\n");
    expect(lines[0]).toBe("Layer 0: default");
    expect((text.match(/┌/g) ?? []).length).toBe(80); // one box per key
  });

  it("shows labels, trans dot, and tap·hold cells inside boxes", () => {
    const text = renderLayer(config, 0);
    expect(text).toContain("⌘C");
    expect(text).toContain("A·⌘");
    expect(text).toContain("│"); // boxes drawn
    // pos 0 is trans → first middle row starts with a box containing ·
    const firstMid = text.split("\n")[3]!;
    expect(firstMid.trimStart().startsWith("│")).toBe(true);
    expect(firstMid).toContain("·");
  });

  it("keeps every line in a box row at equal display width", () => {
    const text = renderLayer(config, 0);
    const lines = text.split("\n");
    // box rows come in consecutive (top, mid, bottom) triples
    for (let i = 0; i < lines.length - 2; i++) {
      if (lines[i]!.trimStart().startsWith("┌")) {
        const w = displayWidth(lines[i]!);
        expect(displayWidth(lines[i + 1]!), `mid of row at line ${i}`).toBe(w);
        expect(displayWidth(lines[i + 2]!), `bottom of row at line ${i}`).toBe(w);
      }
    }
  });

  it("truncates long labels with an ellipsis instead of overflowing", () => {
    const cfg = makeConfig();
    cfg.layers[0]!.keys[10] = { tap: { type: "rgb_ug", action: "RGB_STATUS" }, hold: null };
    const text = renderLayer(cfg, 0);
    expect(text).toContain("…");
    expect(text).not.toContain("RGB_STATUS");
  });

  it("appends a legend for symbols used in the layer", () => {
    const text = renderLayer(config, 0);
    expect(text).toContain("tap·hold"); // pos 34 is a hold-tap
    expect(text).toContain("transparent"); // pos 0 is trans
  });

  it("colors survive alignment (ANSI stripped widths still equal)", () => {
    setColorEnabled(true);
    try {
      const text = renderLayer(config, 0);
      const lines = text.split("\n").map(stripAnsi);
      for (let i = 0; i < lines.length - 2; i++) {
        if (lines[i]!.trimStart().startsWith("┌")) {
          const w = displayWidth(lines[i]!);
          expect(displayWidth(lines[i + 1]!)).toBe(w);
          expect(displayWidth(lines[i + 2]!)).toBe(w);
        }
      }
      expect(text).toContain("[");
    } finally {
      setColorEnabled(false);
    }
  });
});
```

- [ ] **Step 2: Run to verify the new tests FAIL** (old renderLayer produces no `┌`).

- [ ] **Step 3: Replace the rendering section of `render.ts`.** Add imports:

```ts
import { displayWidth, padCenter, truncateDisplay } from "./text-width";
import { bold, cyan, dim, magenta, yellow } from "./color";
```

Delete `CELL_WIDTH`, `cellLabel`, and the old `renderLayer`. Add:

```ts
const MIN_CELL = 4;
const MAX_CELL = 6;
const GUTTER_COL = 9; // the only GLOVE80_GRID column that never holds a key
const GUTTER = "  ";

type CellKind = "normal" | "layer" | "macro" | "trans" | "empty";

interface CellContent {
  tap: string;
  hold: string | null;
  kind: CellKind;
}

function cellContent(key: Key, config: KeyboardConfig): CellContent {
  const names = config.layers.map((l) => l.name);
  const morphs = config.modMorphs ?? [];
  const holdTaps = config.holdTaps ?? [];
  if (key.tap.type === "trans") return { tap: "·", hold: null, kind: "trans" };
  const tapLabel = behaviorLabel(key.tap, names, morphs, holdTaps);
  if (key.tap.type === "none" && !key.hold) return { tap: "", hold: null, kind: "empty" };
  let hold: string | null = null;
  if (key.tap.type === "hold_tap") {
    hold = holdTapSecondaryLabel(key.tap.name, key.tap.param1);
  } else if (key.hold) {
    hold = behaviorLabel(key.hold, names, morphs, holdTaps);
  }
  const kind: CellKind =
    key.tap.type === "mo" || key.tap.type === "to" || key.tap.type === "tog" || key.tap.type === "sl"
      ? "layer"
      : key.tap.type === "macro"
        ? "macro"
        : "normal";
  return { tap: tapLabel, hold, kind };
}

function cellPlainText(c: CellContent): string {
  return c.hold ? `${c.tap}·${c.hold}` : c.tap;
}

/** Center + colorize one cell's content to exactly `width` display columns. */
function renderCellContent(c: CellContent, width: number): string {
  const plain = truncateDisplay(cellPlainText(c), width);
  const centered = padCenter(plain, width);
  const start = centered.indexOf(plain);
  const left = centered.slice(0, start);
  const right = centered.slice(start + plain.length);
  let colored: string;
  if (c.kind === "trans" || c.kind === "empty") {
    colored = dim(plain);
  } else if (c.kind === "layer") {
    colored = yellow(plain);
  } else if (c.kind === "macro") {
    colored = magenta(plain);
  } else if (c.hold && plain === cellPlainText(c)) {
    colored = `${c.tap}${dim("·")}${cyan(c.hold)}`;
  } else {
    colored = plain; // truncated hold-tap: single color
  }
  return left + colored + right;
}

const LEGEND_SYMBOLS: ReadonlyArray<readonly [string, string]> = [
  ["◇", "◇ momentary"],
  ["⇄", "⇄ toggle"],
  ["⇨", "⇨ switch-to"],
  ["◆", "◆ sticky"],
];

function legend(layer: Layer, config: KeyboardConfig): string {
  const contents = layer.keys.map((k) => cellContent(k, config));
  const all = contents.map(cellPlainText).join(" ");
  const parts: string[] = [];
  for (const [symbol, text] of LEGEND_SYMBOLS) {
    if (all.includes(symbol)) parts.push(text);
  }
  if (contents.some((c) => c.hold !== null)) parts.push("A·⌘ tap·hold");
  if (contents.some((c) => c.kind === "trans")) parts.push("· transparent");
  return parts.length ? dim(parts.join("   ")) : "";
}

export function renderLayer(config: KeyboardConfig, layerIndex: number): string {
  const layer = config.layers[layerIndex];
  if (!layer) return `Layer ${layerIndex} not found`;
  const contents = layer.keys.map((k) => cellContent(k, config));
  const widest = Math.max(...contents.map((c) => displayWidth(cellPlainText(c))));
  const w = Math.max(MIN_CELL, Math.min(MAX_CELL, widest));
  const blank = " ".repeat(w + 2);
  const lines: string[] = [bold(`Layer ${layerIndex}: ${layer.name}`), ""];
  for (const row of GLOVE80_GRID) {
    const top: string[] = [];
    const mid: string[] = [];
    const bottom: string[] = [];
    row.forEach((idx, col) => {
      if (col === GUTTER_COL) {
        top.push(GUTTER);
        mid.push(GUTTER);
        bottom.push(GUTTER);
        return;
      }
      if (idx === null) {
        top.push(blank);
        mid.push(blank);
        bottom.push(blank);
        return;
      }
      const c = contents[idx] ?? { tap: "", hold: null, kind: "empty" as const };
      top.push(dim(`┌${"─".repeat(w)}┐`));
      mid.push(`${dim("│")}${renderCellContent(c, w)}${dim("│")}`);
      bottom.push(dim(`└${"─".repeat(w)}┘`));
    });
    lines.push(top.join(" ").trimEnd(), mid.join(" ").trimEnd(), bottom.join(" ").trimEnd(), "");
  }
  const leg = legend(layer, config);
  if (leg) lines.push(leg);
  return lines.join("\n").trimEnd();
}
```

Also add `Layer` to the type imports from `../../types/schema`.

Strictness note: `trimEnd()` on lines containing trailing ANSI resets is safe (resets are not whitespace; only genuinely trailing spaces from blank cells are trimmed — and the alignment TESTS therefore compare widths only within `┌`-triples, where trailing blank-cell runs are identical across the 3 lines... they are NOT identical when a mid line ends with `│` and top ends with `┐` at the same column — both end at the same column, so trimEnd removes the same trailing blank suffix for all three. When a row ends with blank cells, all three lines end with the same `blank` strings, trimmed equally.)

- [ ] **Step 4: Verify** — `npx vitest run src/lib/repl/render.test.ts` all PASS (list/detail tests untouched), `npx vitest run src/lib/repl` all PASS, tsc clean.

- [ ] **Step 5: Eyeball it** — `npm run repl --silent -- layer default | head -30` and `npm run repl --silent -- layer magic | head -30`: boxes aligned, gutter visible, legend at bottom.

- [ ] **Step 6: Commit**

```bash
git add src/lib/repl/render.ts src/lib/repl/render.test.ts
git commit -m "feat(repl): boxed, width-aware, colored layer rendering with legend"
```

---

### Task 7: Real-config alignment regression test

**Files:**
- Create: `src/lib/repl/render.alignment.test.ts`

- [ ] **Step 1: Write the test** (it should PASS immediately if Task 6 is correct — its job is regression)

```ts
// src/lib/repl/render.alignment.test.ts
import { readFileSync } from "fs";
import { describe, it, expect, beforeAll } from "vitest";
import { KeyboardConfigSchema } from "../../types/schema";
import { renderLayer } from "./render";
import { setColorEnabled } from "./color";
import { displayWidth, stripAnsi } from "./text-width";

const config = KeyboardConfigSchema.parse(
  JSON.parse(readFileSync("config.json", "utf-8")),
);

beforeAll(() => setColorEnabled(true)); // exercise the colored path; widths measured after stripAnsi

describe("layer rendering alignment (real config)", () => {
  config.layers.forEach((layer, i) => {
    it(`layer ${i} (${layer.name}) renders aligned boxes`, () => {
      const text = renderLayer(config, i);
      const lines = text.split("\n").map(stripAnsi);
      for (let l = 0; l < lines.length; l++) {
        const line = lines[l]!;
        if (!line.trimStart().startsWith("┌")) continue;
        const top = line;
        const mid = lines[l + 1]!;
        const bottom = lines[l + 2]!;
        // equal display width across the triple
        expect(displayWidth(mid), `layer ${layer.name} line ${l + 1}`).toBe(displayWidth(top));
        expect(displayWidth(bottom), `layer ${layer.name} line ${l + 2}`).toBe(displayWidth(top));
        // every ┌ in the top line has a │ and └ at the same display column
        let col = 0;
        for (const ch of top) {
          if (ch === "┌") {
            expect(charAtDisplayCol(mid, col), `│ at col ${col}`).toBe("│");
            expect(charAtDisplayCol(bottom, col), `└ at col ${col}`).toBe("└");
          }
          col += displayWidth(ch);
        }
      }
    });
  });
});

function charAtDisplayCol(line: string, target: number): string {
  let col = 0;
  for (const ch of line) {
    if (col === target) return ch;
    col += displayWidth(ch);
  }
  return "";
}
```

- [ ] **Step 2: Run** — `npx vitest run src/lib/repl/render.alignment.test.ts`: 18 tests PASS. If any layer fails, the bug is in Task 6's renderer or Task 1's width table (likely a glyph misclassified — fix `charWidth`, not the test).

- [ ] **Step 3: Commit**

```bash
git add src/lib/repl/render.alignment.test.ts
git commit -m "test(repl): alignment regression over all real-config layers"
```

---

### Task 8: Three-tier find + completion + output polish (`dispatch.ts`, `complete.ts`)

**Files:**
- Modify: `src/lib/repl/dispatch.ts` (find arm, USAGE.find, new formatter)
- Modify: `src/lib/repl/complete.ts` (alias names after `find`)
- Test: `src/lib/repl/dispatch.test.ts`, `src/lib/repl/complete.test.ts` (append)

- [ ] **Step 1: Append failing tests.** In `dispatch.test.ts` add `beforeAll(() => setColorEnabled(false));` (import from `./color`, plus `beforeAll` from vitest) and:

```ts
describe("find tiers", () => {
  it("keycode tier still works and stays aligned", () => {
    const text = outputOf("find Cmd+C");
    expect(text).toContain("layer default · RM4 (pos 43) · tap → LG(C)");
  });

  it("alias tier expands concepts with a hint", () => {
    // fixture has LG(C) bound → alias "copy" must hit it
    const text = outputOf("find copy");
    expect(text).toContain("copy ≈ ⌘C");
    expect(text).toContain("LG(C)");
  });

  it("text tier finds entities and keycode labels when other tiers miss", () => {
    const text = outputOf("find copy_u");
    expect(text).toContain('macro "copy_url"');
    const text2 = outputOf("find backspace");
    expect(text2).toContain("keycode BSPC");
  });

  it("still reports nothing found", () => {
    expect(outputOf("find frobnicate")).toContain("No bindings found");
  });
});
```

In `complete.test.ts` append:

```ts
  it("completes alias concepts after `find`", () => {
    expect(complete(config, "find scre")[0]).toEqual(["screenshot"]);
  });
```

Also UPDATE one existing test in `dispatch.test.ts` — unparseable queries now fall through to text search instead of erroring, so:

```ts
  // OLD:
  it("reports unparseable and no-match find queries", () => {
    expect(outputOf("find foo+c")).toContain("Could not parse");
    expect(outputOf("find F24")).toContain("No bindings found");
  });
  // NEW:
  it("reports no-match find queries (unparseable input falls through to text search)", () => {
    expect(outputOf("find foo+c")).toContain("No bindings found");
    expect(outputOf("find F24")).toContain("No bindings found");
  });
```

- [ ] **Step 2: Run to verify the new tests FAIL.**

- [ ] **Step 3: Implement.** In `complete.ts`: import `FIND_ALIASES` from `./find-aliases`; before the final `return [[], last]` add:

```ts
  if (cmd === "find" && parts.length === 2) return pick(Object.keys(FIND_ALIASES));
```

In `dispatch.ts`: extend imports —

```ts
import { findBindings, parseFindQuery, resolveLayer, resolvePosition, textSearch } from "./query";
import type { FindMatch } from "./query";
import { lookupAlias } from "./find-aliases";
import { cyan, dim, green } from "./color";
import { displayWidth, padDisplay } from "./text-width";
```

Replace `USAGE.find` value with:

```ts
  find: "find <query> — reverse lookup: keycodes (`find Cmd+C`), concepts (`find screenshot`), names/labels (`find print`)",
```

Add above `dispatch`:

```ts
function formatFindMatches(results: FindMatch[]): string {
  const width = Math.max(...results.map((r) => displayWidth(r.location)));
  return results
    .map(
      (r) =>
        `${dim(padDisplay(r.location, width))} → ${green(r.binding)}${r.note ? ` ${dim(`(${r.note})`)}` : ""}`,
    )
    .join("\n");
}
```

Replace the `find` case body with:

```ts
    case "find": {
      if (args.length === 0) return out(USAGE.find);
      const raw = args.join(" ");
      const sections: string[] = [];
      const q = parseFindQuery(raw);
      if (q) {
        const results = findBindings(config, q);
        if (results.length > 0) sections.push(formatFindMatches(results));
      }
      const alias = lookupAlias(raw);
      if (alias) {
        for (const aliasQuery of alias.queries) {
          const parsed = parseFindQuery(aliasQuery);
          if (!parsed) continue;
          const results = findBindings(config, parsed);
          if (results.length > 0) {
            sections.push(
              `${cyan(raw.trim().toLowerCase())} ≈ ${alias.hint} — ${aliasQuery}:\n${formatFindMatches(results)}`,
            );
          }
        }
      }
      if (sections.length === 0) {
        for (const t of textSearch(config, raw)) {
          sections.push(t.matches.length > 0 ? `${t.entity}:\n${formatFindMatches(t.matches)}` : t.entity);
        }
      }
      if (sections.length === 0) return out(`No bindings found for ${raw}.`);
      return out(sections.join("\n"));
    }
```

(Note: `find copy` runs tier 1 with key `COPY` — no hits in fixture — then tier 2 hits via the alias. `find Cmd+C` is unaffected. The pre-existing exact-string test for `find Cmd+C` keeps passing because its longest location is the unpadded one.)

- [ ] **Step 4: Verify** — `npx vitest run src/lib/repl` all PASS, tsc clean. Then against the real config:

```bash
npm run repl --silent -- find screenshot   # expect ⌘⇧5/⌘⇧4 bindings on the default layer keys
npm run repl --silent -- find dictation    # text tier: dictation-related macro/entity names
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/repl/dispatch.ts src/lib/repl/complete.ts src/lib/repl/dispatch.test.ts src/lib/repl/complete.test.ts
git commit -m "feat(repl): three-tier find (keycode, alias, text) with aligned colored output"
```

---

### Task 9: Shell polish + final verification

**Files:**
- Modify: `scripts/repl.ts`

- [ ] **Step 1: Colored prompt + spacing.** In `scripts/repl.ts`: add `import { cyan, dim } from "@/lib/repl/color";` and apply —

- banner: `console.log(dim("Glove80 keymap REPL (read-only). Tab completes; \`help\` for commands, \`quit\` to exit."));`
- output spacing in `run()`: `if (result.text) console.log(`\n${result.text}\n`);`
- prompt: `prompt: cyan("glove> ")` (Node readline measures prompt width with VT-control chars stripped, so the colored prompt does not break cursor math).

- [ ] **Step 2: Full suite + smoke**

```bash
npm test                                   # all green (expect 320 + ~45 new)
npx tsc --noEmit                           # clean
npm run repl --silent -- layer magic       # boxes aligned (the original bug report)
npm run repl --silent -- find screenshot
printf 'layer sym\nfind copy\nquit\n' | npm run repl   # interactive: spacing + colors off when piped
glove layers | head -3                     # global launcher (runs main's code pre-merge; just confirm it launches)
```

- [ ] **Step 3: Commit**

```bash
git add scripts/repl.ts
git commit -m "feat(repl): colored prompt and breathing room around output"
```

---

## Verification checklist (after all tasks)

- `npm test` green; `npx tsc --noEmit` clean.
- `npm run repl` shows no DEP0205 warning.
- `layer magic` boxes align perfectly (the original complaint).
- `find screenshot`, `find copy`, `find backspace` produce tiered results.
- `glove` works from any directory after merge to main.
- Colors visible in a real ghostty TTY; absent when piped (`| cat`).
