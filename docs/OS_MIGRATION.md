# OS Migration / Revert Guide (macOS ⇄ Windows/Linux)

The keymap is currently set up for **macOS** (branch `mac-migration`, see
`docs/MAC_SETUP.md` and the design spec `docs/superpowers/specs/2026-05-31-macos-migration-design.md`).

> **Keep this file accurate.** When you change OS-specific keyboard behavior (home-row mod order,
> Windows/Mac shortcut keycodes, macro modifier translations), update the reverse table below.

This guide is for **reverting to Windows/Linux**. The forward transform
(`scripts/macos-migrate.mjs`) is one-directional; revert by either restoring a pre-migration
`config.json` (git history before commit `1e95d4b`) **or** applying the reverse table by hand,
then running `npm run generate-firmware`.

## The macOS-vs-Windows model (why these changes exist)

- **macOS** primary shortcut modifier = **Cmd (GUI)**; **Windows/Linux** = **Ctrl**.
- The keyboard can't know the focused app, so "middle finger = Cmd in apps, Ctrl in terminal" is
  done in **Karabiner** on macOS. On Windows/Linux there is no such swap — the keyboard alone is
  authoritative, so the home-row middle finger should send **Ctrl** directly.

## Reverse table (macOS → Windows/Linux)

### Home-row mods: CAGS → GACS

Swap back on every HRM `hold_tap` `param1` (all layers): `LCTRL→LGUI`, `LGUI→LCTRL`,
`RCTRL→RGUI`, `RGUI→RCTRL`. Net result: pinky=GUI, ring=Alt, middle=Ctrl, index=Shift.
(`LA(LGUI)`/`RA(RGUI)` inner combos are left as-is — they were never swapped.)

### Shortcut keycodes: Mac Cmd → Windows Ctrl

On the `cursor` and `mouse` layers, convert `LG(x)` shortcut taps back to `LC(x)`
(copy/paste/cut/save/find/undo/redo/select-all/new-tab/close/reload/print/etc.).

| Mac (now) | Windows/Linux | Where |
|---|---|---|
| `LG(C/V/X/Z/Y/A/S/F/T/W/R/P/B/D/G)` | `LC(...)` | cursor layer taps |
| `LG(LEFT)` / `LG(RIGHT)` (line start/end) | `HOME` / `END` | cursor layer nav keys |
| `LG(C/V/X)` | `LC(...)` | mouse layer taps |
| `LG(Q)` (quit) | `LA(F4)` (Alt+F4 close) | cursor layer |
| `LA(LS(V))` (Maccy paste) | `LA(LC(V))` (Win paste-special) | cursor layer |
| `LC(LG(Q))` (lock) | `LG(L)` (Win+L) | default layer |
| `LC(LG(SPACE))` (emoji) | `LG(SEMI)` (Win+; emoji) | default layer |
| `LG(LS(N5))` (Cmd+Shift+5) | `PSCRN` | default layer |
| `LG(LS(N5))` (Cmd+Shift+5) | `PRINTSCREEN` | system layer |
| `LA(SPACE)` (launcher) | `LC(SPACE)` (Ctrl+Space launcher) | default layer `&lt 15` thumb |

### Macros (reverse)

| Macro | macOS (now) | Windows/Linux |
|---|---|---|
| `lang_toggle` | tap `CAPS`, `&tog 3` | press `LGUI`, tap `SPACE`, release `LGUI`, `&tog 3` (Win+Space) |
| `delete_to_bol` | `Cmd+Backspace` | `Shift+Home`, `Backspace` |
| `delete_to_eol` | `Ctrl+K` | `Shift+End`, `Backspace` |
| `select_line` | `Cmd+Left`, `Shift+Cmd+Right` | `Home`, `Shift+End` |
| `clipboard_history` | `Option+Shift+V` (Maccy) | Windows clipboard combo (`Win+Ctrl+Shift+V` / Win+V) |
| `gemini_tab` | `Cmd+T` + `@gemini⇥` | `Ctrl+T` + `@gemini⇥` |
| `flow_bookmark` | `Option+Space` + `b ` | `Ctrl+Space` + `b ` |
| `v_space_ctrl_t` | `v ` + `Cmd+T` | `v ` + `Ctrl+T` |

## macOS software to disable when leaving the Mac

- **Karabiner-Elements** — if you added any per-combo terminal swaps (`MAC_SETUP.md` §3),
  disable/remove them (or uninstall). With none, there's nothing to undo — modifiers already pass
  through unchanged.
- **AltTab** — Windows/Linux have native Alt+Tab; uninstall or leave (harmless).
- **Maccy** — Windows has native Win+V; Linux varies. Adjust the `clipboard_history` macro to match.
- **Caps-Lock input switch** — re-point `lang_toggle` to the OS's language shortcut.

## Notes left unchanged (OS-neutral, no revert needed)

`Apps` layer hyperkeys (`Cmd/Win+number`, `Ctrl+Shift+Cmd/Win+letter`), `LA(LGUI)`/`RA(RGUI)`
inner combos, media/consumer keys, `vim_*`/`bt_*`/`rgb_*`/`type_2digits` macros, mod-morphs,
plain Alt/Ctrl/Shift helper keys on the numbers/mouse/system layers.
