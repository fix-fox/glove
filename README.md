# Glove80

A terminal UI for inspecting the Glove80 keymap, finding bindings, clearing keys,
and building and flashing ZMK firmware. Requires Node.js 20 or newer.

```sh
npm ci
npm run repl
```

The TUI starts on the base layer. Use `layer <name>` to switch layers, `key <pos>`
to inspect a key, `find Cmd+C` to find bindings, and `help` to list commands.
Tab completes commands and names.

- `edit` opens `config/glove80.keymap` in `$VISUAL`, then `$EDITOR`, or `vi`.
  Quoted executable paths and arguments such as `code --wait` work. The editor
  command is executed without a shell, so shell expansions and pipelines do not
  run. Use an editor that waits until you finish editing.
- `reload` rereads the keymap and its local includes. A failed load leaves the
  last valid keymap on screen so you can fix the file and reload again.
- `rm <pos>` replaces one binding in its native source, using `&none` on the base
  layer and `&trans` on other layers. It preserves the surrounding source and
  refuses to write if files changed since loading. Run `reload` after external
  edits before clearing a key.

Commands also work without opening the interactive TUI:

```sh
npm run repl -- layers
npm run repl -- find Cmd+C
```

One-shot and piped commands report file, editor, and flash failures with a nonzero
exit code. `edit` needs an interactive terminal. The `scripts/glove` launcher
changes to its own checkout before starting the TUI.

## Configuration and firmware

The files in `config/` are authoritative ZMK configuration. Edit
`config/glove80.keymap`, its local includes, and `config/glove80.conf` directly.
There is no JSON authoring format or generation step. Shared constants and
behavior definitions live in native include files so timing values, layer
indices, and repeated behavior settings have one definition. Optional
`// @label Friendly name` comments immediately before a node supply TUI labels.

The layer constants in `config/constants.h` must match the declaration order
in the keymap. Validation catches mismatches. Shared home-row trigger sets and
timing properties are ordinary ZMK preprocessor constants; the local includes
contain macro and behavior definitions.

The TUI builds a read model for rendering and search. Its loader supports the
restricted native syntax used by this repository and rejects unsupported syntax
instead of silently displaying a partial keymap. `npm run check-config` checks
that the TUI can load the keymap and validates references and binding counts.
The actual ZMK firmware build remains the final check for firmware correctness.

The reader accepts quoted local includes, the standard ZMK headers already used
here, object-like constants with multiline definitions, and the behavior types
present in this keymap. It rejects conditional preprocessing, function-like
macros, unknown behavior types/properties, duplicate or cyclic includes, and
ambiguous numeric syntax. Add reader support and tests before adopting those
constructs. `rm` requires a literal `&behavior` reference. For bindings supplied
by a shared macro or containing embedded comments, use `edit` instead.

The loader validates 80 bindings per layer, behavior references and argument
counts, layer/key ranges, and recursive behavior references. Saves validate the
candidate first, recheck every source file and include target, then atomically
replace only the edited file.

Inside the TUI, `flash` reloads and validates the current files, builds, and
flashes the left half. `flash --full` also flashes the right half. The default
build uses Docker; `--remote` uses GitHub Actions through the `gh` CLI. Flashing
uses macOS bootloader volumes and Hammerspoon notifications. See
[Mac setup](docs/MAC_SETUP.md) for host settings and
[OS migration](docs/OS_MIGRATION.md) for the existing keymap conventions.

## Checks

```sh
npm run check-config
npm test
npm run typecheck
```

Tests cover native config loading and source edits, TUI commands, rendering,
and search. Test and TypeScript discovery stay within this checkout's source
and scripts, excluding nested task worktrees.
