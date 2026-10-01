# Glove80

## Native configuration

Edit `config/glove80.keymap`, its local includes, and `config/glove80.conf`
directly. These files are authoritative; there is no JSON authoring format or
generation step. Keep shared layer indices and timing values in
`config/constants.h`. Layer constants must match declaration order.

Run `make check-config` after config edits. The TUI supports the native syntax
documented in `README.md`; a firmware build remains the final validation.

## OS-Specific Behavior
The keymap is set up for macOS (see `docs/MAC_SETUP.md`). When changing OS-specific
keyboard behavior (home-row mod order, Windows/Mac shortcut keycodes, macro modifier
translations), update `docs/OS_MIGRATION.md` so the revert-to-Windows/Linux instructions
stay accurate.
