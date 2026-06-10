# Keymap REPL (read-only) — Design

**Date:** 2026-06-10
**Status:** Approved pending user spec review

## Goal

An interactive terminal REPL for querying the Glove80 keymap (`config.json`):
inspect keys, render layers, reverse-find bindings, list entities — plus a
passthrough `flash` command for `scripts/glove-flash.sh`. No config mutation in v1.

## Architecture

Two pieces, following existing repo patterns:

- **`src/lib/repl/`** — pure query/format functions over the parsed `Config`.
  No I/O, no readline. Vitest tests alongside (`*.test.ts`), same as the rest
  of `src/lib/`. Reuses `keycodes.ts`, `labels.ts` (`keyCodeDisplayLabel`,
  `behaviorLabel`), `layout-map.ts` (`GLOVE80_GRID`, `GLOVE80_KEY_NAMES`),
  `mod-morph-utils.ts`.
  - `query.ts` — entity lookup/resolution (layers by index/name-prefix,
    positions by index 0–79 or key name like `LM3`), reverse-find engine,
    find-query parser.
  - `render.ts` — ASCII layer rendering, key-detail formatting, entity list
    summaries.
  - `complete.ts` — tab-completion: given an input line, return candidate
    completions (commands, layer names, key names, macro/combo/hold-tap/
    mod-morph names, contextual per command).
- **`scripts/repl.ts`** — thin shell run via `npm run repl` (tsx). Loads and
  Zod-validates `config.json` (same schema as the generator; on validation
  failure print the error and exit). Runs a Node `readline` loop with the
  completer wired in, dispatches commands to the lib. With CLI args
  (`npm run repl -- find Cmd+C`) it executes that single command and exits.

## Commands

| Command | Behavior |
|---|---|
| `layers` \| `macros` \| `combos` \| `holdtaps` \| `morphs` \| `condlayers` | One-line summary per entity (name, index, key facts). |
| `layer <name\|index>` | ASCII Glove80 render of the layer using `GLOVE80_GRID`. Cell label from `behaviorLabel`/`keyCodeDisplayLabel`; hold-taps render as `tap·hold` (e.g. `A·⌘`). |
| `key <layer> <pos>` | Full detail of one key: tap and hold behaviors, with referenced hold-tap / mod-morph / macro definitions expanded inline. `<pos>` is 0–79 or a key name (`LM3`). |
| `macro <name>` / `combo <name>` | Full definition (steps / key positions + binding). |
| `find <query>` | Reverse lookup across all layers (tap + hold), hold-tap and mod-morph internals, macro steps, and combo bindings. |
| `flash [--local\|--remote] [--full]` | Spawn `scripts/glove-flash.sh` with the given flags, stdio inherited; REPL resumes when it exits. The one non-read-only command (touches the keyboard, never `config.json`). |
| `help [command]` | Command list, or per-command usage with examples. |
| `quit` / `exit` / Ctrl-D | Leave the REPL. |

### Addressing

- Layers: by index or case-insensitive name prefix; ambiguous prefix → list matches.
- Positions: index 0–79 or `GLOVE80_KEY_NAMES` name (`LM3`, `RH1`), case-insensitive.

### `find` query parsing

Accepts `Cmd+C`, `LG(C)`, `F5`, `⌘C`-style input. Mac modifier words and
symbols normalize to ZMK form: Cmd/Gui/⌘→LG, Opt/Alt/⌥→LA, Ctrl/⌃→LC,
Shift/⇧→LS. A bare keycode (`C`) matches both bare `C` and modified forms
like `LG(C)` (results note the modifier). An explicit modified query
(`Cmd+C`) matches only that form. Results show location and binding, e.g.
`layer symbols · RM3 (pos 43) · tap → LG(C)`.

## Hints & autocomplete

- **Tab completion** (readline completer backed by `complete.ts`):
  - empty/partial first word → command names;
  - after `layer` → layer names; after `key` → layer names, then key names;
  - after `macro`/`combo` → entity names; after `flash` → flags.
- **Hints:** startup banner lists commands one-line; a command with missing or
  invalid args prints its usage line plus valid values (e.g. unknown layer →
  list of layer names) instead of a bare error. Unknown command → closest-match
  suggestion ("did you mean `layer`?") + pointer to `help`.

## Error handling

- Unknown command / bad args: friendly one-liner with hint; loop continues.
- Invalid `config.json`: Zod error, exit non-zero (same as generator).
- `flash` failure: script's own output is shown; REPL reports the exit code and continues.

## Testing

- Unit tests (vitest) for `query.ts` (layer/position resolution, find-parser,
  reverse lookup incl. macro steps and hold/tap arms), `render.ts` (layer
  render snapshot, key detail), `complete.ts` (contextual candidates).
- `scripts/repl.ts` stays a trivial untested shell, like the other scripts.

## Out of scope (v1)

- Any mutation of `config.json` (edit/set commands).
- Watch/auto-reload of `config.json`.
- Inspecting generated `.keymap` firmware output.
