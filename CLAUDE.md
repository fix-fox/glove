# Glove80 Configurator

## Generated Files
`config/glove80.keymap` and `config/glove80.conf` are generated from `config.json`.
Never edit them directly — edit `config.json` then run `npm run generate-firmware`.

## OS-Specific Behavior
The keymap is set up for macOS (see `docs/MAC_SETUP.md`). When changing OS-specific
keyboard behavior (home-row mod order, Windows/Mac shortcut keycodes, macro modifier
translations), update `docs/OS_MIGRATION.md` so the revert-to-Windows/Linux instructions
stay accurate.
