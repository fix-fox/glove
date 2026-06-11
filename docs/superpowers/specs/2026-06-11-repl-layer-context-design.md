# REPL v3 — Layer Context Mode + Hebrew Labels

**Date:** 2026-06-11
**Status:** Approved (user confirmed design + "proceed")
**Builds on:** v2 (`2026-06-10-repl-v2-polish-design.md`)

## 1. Layer context mode

`layer <x>` renders the layer (as today) **and enters it**: the prompt becomes
`glove > <name> > ` and subsequent commands are interpreted in that layer's
context until the user goes back up.

### State & contracts

- `ReplState = { layerIndex: number | null }`, owned by the shell
  (`scripts/repl.ts`); `null` = top level.
- `dispatch(config, line, state)` gains the state parameter (optional,
  defaulting to top level, so existing call sites/tests stay valid).
- Two new `DispatchResult` kinds:
  - `{ kind: "enter-layer"; index: number; text: string }` — `text` is the
    rendered board; emitted by `layer <x>` whether at top level or inside
    another context (switching).
  - `{ kind: "exit-layer" }` — emitted by the exit words when in a context.
- The shell applies state transitions and sets the prompt:
  - top level: `cyan("glove> ")` (unchanged)
  - context: `cyan("glove") + dim(" > ") + yellow(name) + dim(" > ")`
- One-shot mode (`glove layer x`): enter-layer is treated as plain output —
  print `text`, exit; no persistent context.

### In-context interpretation (checked in order, before the normal table)

1. `up`, `..`, `esc` (case-insensitive words) → `{ kind: "exit-layer" }`.
   At top level these stay unknown commands (did-you-mean applies).
2. A bare token that `resolvePosition` accepts (`34`, `LM3`) → `keyDetail`
   for that position in the context layer.
3. `key <pos>` (one arg) → auto-fill the context layer. `key <layer> <pos>`
   (two args) keeps working everywhere. At top level, one-arg `key` still
   prints usage.
4. `layer <y>` → switch context (new enter-layer result).
5. Everything else falls through to the normal command table — global
   commands (find, macros, layers, flash, help, quit…) work unchanged.

### Help & hints in context

- `help` (no topic) in a context prepends:
  `in layer "<name>" — bare position (34, LM3) or key <pos> for key detail; up/../Esc to go back` (dim).
- Unknown-command message in context appends a dim ` (in layer "<name>" — \`up\` to go back)`.

### Real Esc key

In the interactive shell (TTY only): `readline.emitKeypressEvents(stdin, rl)`;
on `key.name === "escape"` while in a context — clear the current input line,
exit the context, print nothing, re-prompt at top level. Esc at top level is a
no-op. Lives in the shell (untested, like the rest of the readline wiring).

### Completion (state-aware)

`complete(config, line, state)` — state optional. In a context:
- first token: nav words (`up`, `..`, `esc`) + `GLOVE80_KEY_NAMES` (bare-pos
  shorthand) + the normal COMMANDS.
- `key <Tab>` (second token): position names (`GLOVE80_KEY_NAMES`) instead of
  layer names; `key <layer> <pos>` three-token completion still offers
  positions (unchanged).
- Everything else: as at top level.

## 2. Hebrew labels on hebrew layers

`renderLayer` (and `keyDetail`'s kp description) currently ignore the
`hebrewMode` parameter that `behaviorLabel`/`keyCodeDisplayLabel` support, so
the `hebrew`/`hebrew-alt` layers render Latin keycodes. Fix: compute
`hebrewMode = layer.name.toLowerCase().includes("hebrew")` — the **same rule
as the web UI** (`KeyCap.tsx` / `KeyboardLayout.tsx`) — and pass it through:

- `cellContent` → `behaviorLabel(..., hebrewMode)` (boxed board cells).
- `keyDetail` → `describeBehavior` gains the layer's hebrewMode for its
  `kp` arm (`keyCodeDisplayLabel(code, hebrewMode)`); other arms unchanged.

Covers `hebrew`, `hebrew-alt`, and `hebrew_symbols`. Hebrew glyphs are width-1
(already handled in `text-width.ts`); the alignment regression suite over the
real config verifies the hebrew layers stay aligned.

## Testing

- dispatch: enter (renders + kind), exit words, switch, bare-pos detail,
  one-arg `key` auto-fill in context vs usage at top level, global command
  pass-through in context, `up` unknown at top level, context-aware help and
  unknown-command hint.
- complete: context first-token candidates (nav + key names), `key <Tab>` →
  positions in context.
- render: hebrew layer cells show Hebrew characters (fixture layer named
  "hebrew" with a kp A key → א-class label via `hebrewLabel`); alignment
  suite (real config) stays green.
- Esc keypress: shell-only, untested by design.

## File changes

| File | Change |
|---|---|
| `src/lib/repl/dispatch.ts` (+test) | ReplState, new result kinds, in-context interpretation, help/hints |
| `src/lib/repl/complete.ts` (+test) | state param, contextual candidates |
| `src/lib/repl/render.ts` (+test) | hebrewMode pass-through in cellContent/keyDetail |
| `scripts/repl.ts` | state ownership, prompt, Esc keypress, enter/exit handling |
