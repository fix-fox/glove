# Glove80

A terminal UI for inspecting the Glove80 keymap, finding bindings, clearing keys,
and building and flashing ZMK firmware. Requires Node.js 20 or newer.

```sh
npm ci
npm run repl
```

The TUI starts on the base layer. Use `layer <name>` to switch layers, `key <pos>`
to inspect a key, `find Cmd+C` to find bindings, and `help` to list commands.
Tab completes commands and names. `rm <pos>` clears a key on the displayed layer
and saves `config.json`.

Commands also work without opening the interactive TUI:

```sh
npm run repl -- layers
npm run repl -- find Cmd+C
```

The `scripts/glove` launcher changes to its own checkout before starting the TUI.

## Configuration and firmware

`config.json` is the source for the TUI and firmware generator. Edit that file,
then generate the ZMK files:

```sh
npm run generate-firmware
```

This writes `config/glove80.keymap` and `config/glove80.conf`. Direct edits to
those two files are overwritten on the next generation. `config/west.yml`,
`build.yaml`, and `.github/workflows/build.yml` are maintained directly.

Inside the TUI, `flash` generates, builds, and flashes the left half. `flash --full`
also flashes the right half. The default build uses Docker; `--remote` uses
GitHub Actions through the `gh` CLI. Flashing uses macOS bootloader volumes and
Hammerspoon notifications. See [Mac setup](docs/MAC_SETUP.md) for host settings
and [OS migration](docs/OS_MIGRATION.md) for the existing keymap conventions.

## Checks

```sh
npm test
npm run typecheck
```

Tests cover the TUI commands, rendering, search, config migrations, and firmware
generation. Test and TypeScript discovery stay within this checkout's source
and scripts, excluding nested task worktrees.
