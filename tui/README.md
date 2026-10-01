# Bubble Tea prototype

A working interface for evaluating a Go migration. It uses Bubble Tea v2,
Bubbles lists, text inputs, scrollable details, and Lip Gloss styling. It reads
the checkout's actual native config, including its physical keyboard geometry.

## Run

Requires Node.js 20+ and Go 1.26+. From the repository root:

```sh
npm ci
npm run tea:build
npm run tea
```

`scripts/glove-tea` works from any directory. It runs `build/glove-tea` when
present, or `go run` otherwise. Rebuild after changing Go code; the launcher
does not automatically rebuild an existing binary. `GLOVE_GO` can name an
alternative Go executable for the `go run` fallback.

Config changes apply to the checkout containing the launcher. Running the
prototype from a task worktree edits that worktree's `config/` files.

## Compare designs

```sh
scripts/glove-tea --layout=studio --keys=tiles
scripts/glove-tea --layout=focus --keys=compact
```

| Option | Behavior |
| --- | --- |
| `--layout=studio` | Keyboard and selected-key inspector side by side in wide terminals. |
| `--layout=focus` | Full-width keyboard with the selected key below it. |
| `--keys=tiles` | Bordered keys with separate tap and hold labels. |
| `--keys=compact` | Borderless rows with more space for labels. |

Switch layouts with `v` and key styles with `d`. Studio puts the inspector below
the keyboard under 144 columns. Below 100 columns, the board follows the selected
half; `s` explicitly selects both, left, or right. Below 42 rows, keys become
Compact. Below 30 rows, hold labels move to the selected-key details. The minimum
usable terminal is 40 columns by 22 rows. `enter` always opens full details.

Generate the self-contained HTML comparison after building:

```sh
npm run tea:preview
open build/tea-preview.html
```

The page compares actual Go renders at two widths across the keyboard,
definitions, search, and action palette. It needs no server or web dependencies.
Re-run the generator after edits; it invalidates cached frames when the binary
or source/config files change. The page is a visual comparison; interactive
navigation and actions run in the terminal.

To export an individual terminal frame:

```sh
scripts/glove-tea --snapshot --layout=studio --keys=tiles --width=150 --height=46
scripts/glove-tea --snapshot --screen=search --query='Cmd+C'
```

## Controls and capabilities

| Key | Action |
| --- | --- |
| Arrows or `h j k l` | Move across physical keys, including thumb clusters. |
| `g`, `[` / `]` | Searchable layer picker, previous / next layer. |
| `enter` | Full key or definition detail. |
| `tab` | Switch between keyboard and definitions. |
| `/` | Find bindings on the keyboard; filter the definitions list. |
| `ctrl+f` | Find bindings from either tab. |
| `ctrl+p` | Searchable action palette. |
| `:` | Run any existing TUI command. |
| `e` | Open the native keymap in `$VISUAL`, `$EDITOR`, or `vi`. |
| `r` | Reload and validate; retain the last good map on failure. |
| `x` | Confirm clearing a key to `&none` on base or `&trans` elsewhere. |
| `f` | Choose local/remote and left/both build and flash, then confirm. |
| `pgup` / `pgdown` | Scroll search results and details. |
| `esc` | Cancel or go back. |
| `?`, `q` | Help, quit. `ctrl+c` quits from inputs as well. |

List filtering uses `/`, then `enter` to accept the filter and another `enter`
to open the selection. Search uses the existing keycode, chord, concept-alias,
and text lookup. Definitions include macros, combos, hold-taps, mod-morphs,
conditional layers, and tap dances.

The command entry preserves `layers`, `layer`, `left`, `right`, `both`, `key`,
`macros`, `macro`, `combos`, `combo`, `holdtaps`, `morphs`, `condlayers`, `find`,
`rm`, `reload`, `edit`, `flash`, `help`, and `quit`. It also accepts bare key
positions. The existing Node CLI still provides completion and one-shot/piped
commands; the prototype command field does not yet complete text.

## Migration boundary

Go owns rendering, navigation, filtering, dialogs, and terminal process handoff.
A small JSON subprocess bridge calls the existing TypeScript loader, semantic
labels, search, and atomic source editor. This is a prototype frontend migration;
it is not yet a standalone Go binary. The bridge avoids a second native parser
or a second config schema while the interface is being evaluated.

Every search/command/clear request carries the displayed config revision.
External edits require reload before those actions run. Safe clearing still
validates the candidate, checks every source and include target, and atomically
replaces only the selected literal binding. No generated config is introduced.
The editor and firmware script temporarily own the terminal and reload on return.

For a full Go migration, port the native reader and editor with their existing
fixtures, then remove the bridge and TypeScript UI together. Keep the native
config files as the single authoring source.

## Checks

```sh
npm test
npm run typecheck
npm run check-config
npm run tea:test
cd tui && go vet ./...
```

Go tests use the real bridge for read-only snapshots and search. They cover
physical navigation, design switches, list filtering, frame sizes, stale
revisions, error recovery, and confirmation flows. TypeScript tests exercise
actual clear writes in temporary config fixtures. Hardware flashing must be
tested separately with the keyboard connected.

Dependencies are pinned in `go.mod` and `go.sum`. Bubble Tea's
[v2 documentation](https://pkg.go.dev/charm.land/bubbletea/v2) describes the
declarative views and terminal process integration used here.
