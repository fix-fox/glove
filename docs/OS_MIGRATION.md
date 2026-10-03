# OS Migration / Revert Guide (macOS ⇄ Windows/Linux)

The keymap is currently set up for **macOS** (branch `mac-migration`, see
`docs/MAC_SETUP.md` and the design spec `docs/superpowers/specs/2026-05-31-macos-migration-design.md`).

> **Keep this file accurate.** When you change OS-specific keyboard behavior (home-row mod order,
> Windows/Mac shortcut keycodes, macro modifier translations), update the reverse table below.

This guide is for reverting to Windows/Linux. Apply the reverse table directly
in `config/glove80.keymap` and `config/glove80-macros.dtsi`. Shared behavior
settings live in `config/glove80-behaviors.dtsi` and `config/constants.h`.
Run `make check-config`, then build the firmware. The former JSON migration
script and generation step have been removed.

## The macOS-vs-Windows model (why these changes exist)

- **macOS** primary shortcut modifier = **Cmd (GUI)**; **Windows/Linux** = **Ctrl**.
- The keyboard can't know the focused app, so "middle finger = Cmd in apps, Ctrl in terminal" is
  done in **Karabiner** on macOS. On Windows/Linux there is no such swap — the keyboard alone is
  authoritative, so the home-row middle finger should send **Ctrl** directly.

## Reverse table (macOS → Windows/Linux)

### Home-row mods: CAGS → GACS

Swap the first argument of each `&hml` and `&hmr` binding on all layers: `LCTRL→LGUI`, `LGUI→LCTRL`,
`RCTRL→RGUI`, `RGUI→RCTRL`. Net result: pinky=GUI, ring=Alt, middle=Ctrl, index=Shift.
(`LA(LGUI)`/`RA(RGUI)` inner combos are left as-is — they were never swapped.)

The `cursor` layer has plain Ctrl, Alt, Cmd, and Shift keys at A/R/S/T,
positions 35–38. For Windows/Linux, swap its `&kp LCTRL` at position 35 with
`&kp LGUI` at position 37; leave Alt and Shift unchanged. Positions 47–51
send Cmd+Z/X/C/D/V; the remaining 31 keys on its left half are transparent.

Keep `hml_ctrl_a` and `hmr_ctrl_a` on the `tmux` layer unchanged: their Ctrl, Alt,
and Shift holds are terminal modifiers on every OS. The `tmux_prefix`
[mod-morph](https://zmk.dev/docs/keymaps/behaviors/mod-morph#advanced-configuration)
masks held modifiers only during Ctrl+A, restoring them for the command key.

### Shortcut keycodes: Mac Cmd → Windows Ctrl

On the `mouse` layer, convert Cmd copy/paste/cut shortcuts back to Ctrl.
The `cursor` layer uses Cmd+Left and Cmd+Right for line navigation and
Cmd+Z/X/C/D/V at positions 47–51. Convert those letter shortcuts to Ctrl
for Windows/Linux. Its right-hand Maccy shortcut remains cleared.

| Mac (now) | Windows/Linux | Where |
|---|---|---|
| `LG(LEFT)` / `LG(RIGHT)` (line start/end) | `HOME` / `END` | cursor layer nav keys |
| `LG(C/V/X)` | `LC(...)` | mouse layer taps |
| `LG(Z/X/C/D/V)` | `LC(...)` | cursor layer positions 47–51 |
| `LC(LG(Q))` (lock) | `LG(L)` (Win+L) | default layer |
| `LC(LG(SPACE))` (emoji) | `LG(SEMI)` (Win+; emoji) | default layer |
| `LG(LS(N5))` (Cmd+Shift+5) | `PSCRN` | default layer (key 72 tap, via `shot_ht`) |
| `LG(LS(N4))` (Cmd+Shift+4) | (no Win equivalent; drop the hold) | default layer (key 72 **hold**, via `shot_ht`) |
| `LG(LS(N5))` (Cmd+Shift+5) | `PRINTSCREEN` | system layer |
| `LA(SPACE)` (launcher) | `LC(SPACE)` (Ctrl+Space launcher) | default layer thumb (key 73, tap 1 of `td_launcher_prevapp`) |
| `LG(TAB)` (Cmd+Tab prev app) | `LA(TAB)` (Alt+Tab) | default layer thumb (key 73, tap 2 of `td_launcher_prevapp`) |

### Macros (reverse)

| Macro | macOS (now) | Windows/Linux |
|---|---|---|
| `lang_toggle` | press `LCTRL`, tap `SPACE`, release `LCTRL`, `&tog 3` (Ctrl+Space) | press `LGUI`, tap `SPACE`, release `LGUI`, `&tog 3` (Win+Space) |
| `delete_to_bol` | `Cmd+Backspace` | `Shift+Home`, `Backspace` |
| `delete_to_eol` | `Ctrl+K` | `Shift+End`, `Backspace` |
| `select_line` | `Cmd+Left`, `Shift+Cmd+Right` | `Home`, `Shift+End` |
| `clipboard_history` | `Option+Shift+V` (Maccy) | Windows clipboard combo (`Win+Ctrl+Shift+V` / Win+V) |
| `gemini_tab` | `Cmd+T` + `@gemini⇥` | `Ctrl+T` + `@gemini⇥` |
| `flow_bookmark` | `Option+Space` + `b ` | `Ctrl+Space` + `b ` |
| `v_space_ctrl_t` | `v ` + `Cmd+T` | `v ` + `Ctrl+T` |
| `dictation` | double-tap `LCTRL` (macOS "Press Control twice"); on key 75 **hold** (`dict_enter`) and Apps-layer key 69 | no direct equivalent — bind to the target OS's dictation/speech shortcut, or remove the key |
| `caps_mac` | taps `CAPS` held ~150 ms (macOS ignores too-brief Caps taps); on shift keys 54/55 tap via `shift_caps` | revert keys 54/55 to plain `&mt LSHIFT CAPS` — no hold-delay needed off macOS |

## macOS software to disable when leaving the Mac

- **Karabiner-Elements** — if you added any per-combo terminal swaps (`MAC_SETUP.md` §3),
  disable/remove them (or uninstall). With none, there's nothing to undo — modifiers already pass
  through unchanged.
- **AltTab** — Windows/Linux have native Alt+Tab; uninstall or leave (harmless).
- **Maccy** — Windows has native Win+V; Linux varies. Adjust the `clipboard_history` macro to match.
- **Caps-Lock input switch** — re-point `lang_toggle` to the OS's language shortcut.

## Flash script (`scripts/glove-flash.sh`)

Rewritten **macOS-only**: it detects the bootloader halves at `/Volumes/GLV80LHBOOT` /
`/Volumes/GLV80RHBOOT` and copies the UF2 with `cp`. To flash from Windows/WSL again, restore the
version of the script from *before* the rewrite — i.e. the parent of the commit
"build: rewrite glove-flash.sh for macOS". Find it with `git log --oneline -- scripts/glove-flash.sh`,
then check out the pre-rewrite file, e.g. `git checkout <rewrite-commit>^ -- scripts/glove-flash.sh`.
That pre-rewrite version polled `cmd.exe /c "if exist D:\"` and copied via `wslpath` + `cmd.exe /c copy ... D:\`.

## Notes left unchanged (OS-neutral, no revert needed)

`Apps` layer hyperkeys (`Cmd/Win+number`, `Ctrl+Shift+Cmd/Win+letter`), `LA(LGUI)`/`RA(RGUI)`
inner combos, media/consumer keys, `vim_*`/`bt_*`/`rgb_*`/`type_2digits` macros, mod-morphs,
plain Alt/Ctrl/Shift helper keys on the numbers/mouse/system layers.
