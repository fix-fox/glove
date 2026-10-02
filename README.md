# Glove80

A Go and Bubble Tea terminal app for inspecting the Glove80 keymap, finding
bindings, editing native config, and building and flashing ZMK firmware.

```sh
make build
scripts/glove
```

Building requires Go 1.26 or newer. `scripts/glove` uses Go's incremental build
cache when Go is available. Set `GLOVE_GO` to use a Go executable outside `PATH`.
The launcher also works from another directory or through a symlink.

After building, `build/glove --root /path/to/glove` runs directly without Go or
Node installed. The launcher can also use the prebuilt binary without Go; it
checks the source and binary checksums first and asks for a rebuild if they
changed. Runtime config edits do not require recompilation.

## Terminal interface

The interface uses the approved Studio layout with tiled keys. Wide terminals
show the selected binding beside the keyboard. Narrow terminals put details
below it. Under 100 columns, the view follows the selected keyboard half.
Short terminals scroll whole keyboard rows to keep the selected key visible.
The minimum supported size is 40 columns by 22 rows.

| Key | Action |
| --- | --- |
| Arrows | Move across physical keys, including thumb clusters. |
| `l`, `[` / `]` | Layer picker, previous / next layer. Type to filter; Enter opens the selection. |
| `g` | Show positions on the second line of every key. Type `0`–`79` and Enter to jump; Esc cancels. |
| `enter` | Full binding or definition details. |
| `tab` | Switch between keyboard and definitions. |
| `/` | Search live, including single characters. Arrows choose a result; Enter navigates to its key, layer, or definition. |
| `ctrl+f` | Find bindings from either tab. |
| `ctrl+p` | Command palette. Type to filter; Enter executes the selection. |
| `:` | Command entry; Tab completes commands and names, then cycles matches. |
| `s` | Show both halves, left, or right. |
| `e` | Open the keymap in `$VISUAL`, `$EDITOR`, or `vi`. |
| `r` | Reload config. A failed load retains the last valid map. |
| `x` | Confirm clearing the selected key. |
| `f` | Choose local/remote and left/both build and flash, then confirm. |
| `pgup` / `pgdown` | Scroll search results and details. |
| `esc` | Cancel or go back. |
| `?`, `q` | Help, quit. `ctrl+c` quits from inputs too. |

Mouse clicks select keys, open search results and menu choices, and switch tabs.
The wheel moves through keys and lists or scrolls details. Positions are shown
as numbers throughout the app; selecting a key does not add its position to the
keycap. The `g` overlay temporarily replaces secondary labels with positions.

Key labels and the legend share one color mapping: ordinary taps are white,
modifiers and morph alternatives are purple, layer actions are blue, and macros
are pink. Tap and hold labels are colored independently. Selection changes the
border and background while preserving those colors.

Search supports keycodes, chords such as `Cmd+C`, concepts such as `screenshot`,
and partial labels and definition names. Definitions include macros, combos,
hold-taps, mod-morphs, conditional layers, and tap dances.

An editor command can include quoted paths and arguments, such as `code --wait`.
Arguments are parsed without a shell. Use an editor that waits for editing to
finish; the TUI restores the terminal and reloads the config when it exits.

## Commands and scripting

The same commands work in the TUI's `:` entry, as one-shot CLI commands, and
through stdin:

```sh
scripts/glove layers
scripts/glove find Cmd+C
scripts/glove key 43
printf 'layer symbols\nkey 52\nquit\n' | scripts/glove
```

Commands: `layers`, `layer <name|index>`, `left`, `right`, `both`, `key <position>`,
`macros`, `macro <name>`, `combos`, `combo <name>`, `holdtaps`, `morphs`,
`condlayers`, `tapdances`, `find <query>`, `rm <position>`, `reload`, `edit`,
`flash [--local|--remote] [--full]`, `help`, and `quit`. A bare position such as
`43` opens that binding. Prefixes can select unambiguous layer names.

One-shot and piped failures produce a nonzero exit code. Piped sessions keep
reading after a failed command, retaining the last valid map. `edit` needs an
interactive terminal. `rm` in the CLI is an explicit edit and runs directly;
the full-screen TUI asks for confirmation.

## Native configuration

The files in `config/` are authoritative ZMK configuration. Edit
`config/glove80.keymap`, its local includes, and `config/glove80.conf` directly.
There is no JSON authoring format or generation step. Shared constants and
behavior definitions live in native include files, so timing values, layer
indices, and repeated behavior settings have one definition. Optional
`// @label Friendly name` comments immediately before a node supply TUI labels.

The layer constants in `config/constants.h` must match declaration order.
The reader checks references, argument counts, all 80 bindings per layer,
layer/key ranges, duplicate names, and recursive behavior references.

Supported syntax includes quoted local includes, the standard ZMK headers
already used here, object-like constants with multiline definitions, and the
behavior types present in this keymap. Conditional preprocessing, function-like
macros, unknown behavior types/properties, duplicate or cyclic includes, and
ambiguous numeric syntax are rejected. Add reader support and tests before
adopting those constructs.

Clearing uses `&none` on the base layer and `&trans` elsewhere. It changes only
the selected literal binding, validates the candidate, rechecks every source
and include destination, and atomically replaces the edited file. Shared macros
and bindings with embedded comments require the external editor. Reload after
external edits before clearing a key. Failed edits preserve the original files.

## Firmware

```sh
make check-config
make build-firmware
```

Config validation checks the native reader. A ZMK build remains the final check
for firmware correctness. `flash` validates current files before any build,
then builds and flashes the left half. `--full` includes both halves. Local
builds use Docker; `--remote` uses GitHub Actions through `gh`.

Flashing uses macOS bootloader volumes and Hammerspoon notifications. See
[Mac setup](docs/MAC_SETUP.md) and [OS migration](docs/OS_MIGRATION.md) for the
keyboard's OS conventions. Files under `docs/plans` and `docs/superpowers` are
historical designs and can refer to tools removed by later migrations.

## Development and checks

```sh
make check
```

The module is rooted at this checkout, so `go test ./...` excludes nested task
worktrees. `cmd/glove` owns the Bubble Tea app and CLI. `internal/keymap` reads
and safely edits native sources; `internal/keymapview` supplies semantic labels,
search, definitions, and commands. The editor and firmware workflow tests live
under `internal/editor` and `internal/firmware`.

Tests cover native config acceptance/rejection, safe edits, semantic parity,
geometry and resizing, input and command flows, and stubbed firmware workflows.
No test flashes hardware. See [migration coverage](docs/GO_MIGRATION.md) for the
coverage carried over from TypeScript.

For a reproducible terminal rendering:

```sh
scripts/glove --snapshot --width=150 --height=46 --layer=0
```
