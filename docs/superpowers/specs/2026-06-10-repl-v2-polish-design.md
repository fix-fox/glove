# REPL v2 — Polish & Ergonomics Design

**Date:** 2026-06-10
**Status:** Approved (user: "looks good, proceed to completion")
**Builds on:** `2026-06-10-keymap-repl-design.md` (v1, merged at b8cebb3)

## Goals

1. No deprecation warning on startup.
2. Global `glove` command runnable from anywhere.
3. Boxed, correctly aligned layer rendering (current render misaligns, e.g. `layer magic`).
4. Smarter `find` ("screenshot" should hit the `LG(LS(N4/N5))` bindings).
5. ANSI colors + breathing room, themed automatically by ghostty (Catppuccin Mocha).

## 1. Deprecation warning

DEP0205 comes from tsx's `module.register()` loader on Node 26. Change package.json:

```json
"repl": "node --no-deprecation --import=tsx scripts/repl.ts"
```

Same invocation in the `glove` launcher. No code change.

## 2. `glove` launcher

New `scripts/glove` (committed, executable):

```bash
#!/bin/bash
# Global launcher for the keymap REPL. Symlinked from ~/.local/bin/glove.
cd "$(dirname "$(readlink -f "$0")")/.." || exit 1
exec node --no-deprecation --import=tsx scripts/repl.ts "$@"
```

Install: `ln -sf ~/glove/scripts/glove ~/.local/bin/glove`. Track in the dotfiles
bare repo per the established flow (allowlist `!`-rule for `.local/bin/glove`,
`dot add/commit/push`). `glove` → interactive REPL; `glove find Cmd+C` → one-shot.

## 3. Layer rendering v2

### Root cause fixes

- **`src/lib/repl/text-width.ts`** — `displayWidth(s)`: strips ANSI escapes and
  variation selectors (U+FE0E/F), counts zero-width/combining marks as 0,
  East-Asian Wide/Fullwidth ranges and emoji as 2, everything else
  (incl. ⌘⌥⌃⇧▲▼◀▶◇◆⇄⇨·⌫⌦, which ghostty renders single-cell) as 1.
  Also `padDisplay(s, width)` and `truncateDisplay(s, width)` (ellipsis `…`).
  All rendering uses these instead of `.length`/`.padEnd`/`.slice`.

### Boxed board

- Each key renders as a 3-line box: `┌──────┐` / `│ A·⌘  │` / `└──────┘`
  (box width = content width + 2 border chars; labels centered within the
  content width), one space between boxes, one blank line between key rows.
- Column model: the 19-column `GLOVE80_GRID` has exactly one never-key column
  (index 9) — it renders as a fixed 2-space gutter. The other 18 columns each
  render at uniform box width, so vertical alignment matches the physical board
  (verified: columns 0–8, 10–18 all host keys in some row).
- Content width: `clamp(4, longest label display-width in the layer, 6)`;
  longer labels truncate via `truncateDisplay` with `…`. Board width therefore
  ≤ 18×(6+2+1)+2 = 164 worst case, typically ~110–130.
- Header `Layer 5: symbols` (bold), footer legend listing only the symbols used
  in that layer, e.g. `◇ momentary  ⇄ toggle  ⇨ switch  ◆ sticky  A·⌘ tap·hold  · transparent`.
- Empty keys (`none`) render as an empty box; `trans` renders as a box containing `·` (dim).

### Cell colors (see §5)

Tap label default; `·hold` suffix cyan; layer-switch labels (mo/to/tog/sl) yellow;
macro names magenta; `·`/empty dim; borders dim. Color is applied after width
math (or `displayWidth` strips ANSI — both hold).

### Alignment regression test

`render.alignment.test.ts` loads the **real** `config.json` (via
`KeyboardConfigSchema.parse`, same as the shell), renders every layer, strips
ANSI, and asserts for each box-row block: all lines have identical
`displayWidth`, and `┌`/`│`/`└` columns coincide across the block's three lines.
This is the "test all layer rendering" requirement and runs in `npm test`.

## 4. Smarter `find`

Three tiers, all results shown, grouped and labeled by tier:

1. **Keycode query** — existing semantics (`Cmd+C`, `LG(C)`, `F5`, bare-vs-explicit mods).
2. **Alias table** — new `src/lib/repl/find-aliases.ts`: `Record<concept, {queries: string[], hint: string}>`
   seeded from docs/MAC_SETUP.md §7 (the source of truth for these chords; keep a
   comment pointing there): screenshot → `LG(LS(N5))`, `LG(LS(N4))`, `LG(LS(N3))`, `PSCRN`;
   lock → `LC(LG(Q))`; emoji → `LC(LG(SPACE))`; launcher → `LA(SPACE)`;
   clipboard/maccy → `LA(LS(V))`; alttab → `LA(TAB)`; lang → `LC(SPACE)`;
   plus generics: copy `LG(C)`, paste `LG(V)`, cut `LG(X)`, undo `LG(Z)`,
   redo `LS(LG(Z))`, save `LG(S)`, newtab `LG(T)`, close `LG(W)`.
   Mod order in entries is irrelevant (queries run through `parseFindQuery`,
   which sorts mods). Output prefixes the expansion, e.g.
   `screenshot ≈ ⌘⇧5 — LG(LS(N5)):` followed by its matches.
3. **Text fallback** — case-insensitive substring over macro/combo/mod-morph/
   hold-tap names + labels, layer names, and `ZMK_KEYCODES` labels
   ("print screen" → PSCRN → reverse-find its bindings). Runs when tiers 1–2
   produced nothing, or when the query contains characters that can't be a
   keycode query. Matches show what matched (`macro name "copy_url"`,
   `keycode PSCRN "Print Screen"`).

`find` tab-completion additionally offers alias concept names.
`help find` documents the tiers with examples.

## 5. Colors & spacing

- **`src/lib/repl/color.ts`** — zero-dep ANSI-16 helpers (`bold`, `dim`, `cyan`,
  `yellow`, `magenta`, `green`, `red`). Standard ANSI indices only, so ghostty's
  active theme supplies the palette automatically. Enabled iff
  `process.stdout.isTTY && !process.env.NO_COLOR`; the check lives behind
  `colorEnabled()` so tests (non-TTY) get plain text deterministically.
- Applied across commands: bold headers, dim find-locations / borders /
  separators, cyan command names in help + the `glove> ` prompt, green matched
  bindings in find, magenta macro names, yellow layer references.
- Spacing: shell prints one blank line before and after each command's output;
  `layers`/find output column-aligned via `padDisplay`.

## 6. Out of scope

- Live re-render on terminal resize (requires alt-screen TUI; user accepted
  always-side-by-side instead).
- Any mutation commands; watch mode.

## Testing

- Unit: text-width (wide/zero-width/ANSI cases), color (enabled/disabled),
  find-aliases (screenshot resolves; expansion labels), find tiers (alias hit,
  text fallback hit, keycode tier unchanged), boxed render (box chars, gutter,
  truncation, legend).
- Integration: alignment test over all real-config layers (§3).
- Existing 56 repl tests keep passing (find output format changes are allowed;
  update assertions where the spec changed them deliberately).

## File changes

| File | Change |
|---|---|
| `package.json` | repl script → `node --no-deprecation --import=tsx` |
| `scripts/glove` | new launcher (+ symlink install + dotfiles tracking) |
| `src/lib/repl/text-width.ts` (+test) | new |
| `src/lib/repl/color.ts` (+test) | new |
| `src/lib/repl/find-aliases.ts` (+test) | new |
| `src/lib/repl/render.ts` (+tests) | boxed renderLayer, colors, legend |
| `src/lib/repl/render.alignment.test.ts` | new, real-config all-layers |
| `src/lib/repl/query.ts` (+tests) | text-fallback search helpers |
| `src/lib/repl/dispatch.ts` (+tests) | find tiers, colored/aligned output |
| `src/lib/repl/complete.ts` (+test) | alias names after `find` |
| `scripts/repl.ts` | colored prompt, blank-line spacing |
