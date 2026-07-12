# Voyager evaluation — findings (July 2026)

Question: is there anything the current Glove80 config does that a ZSA Voyager
could not? Verified against the actual `config.json`-generated keymap, ZSA
docs/blog, and the Oryx/Keymapp source. See `PORT.md` for the concrete port.

## Verdict

Only one thing is truly impossible: **wireless**. Everything else is
achievable, but a meaningful chunk needs hand-written QMK C rather than the
Oryx GUI. ZSA officially supports that hybrid workflow.

## Hard hardware losses

- **Bluetooth**: Voyager is wired-only (USB-C). The Glove80's 4 BT profiles /
  device switching (`bt_0`–`bt_3`, `OUT_USB`/`OUT_BLE`) have no equivalent.
- **Thumb cluster**: 6 → 2 keys per hand. ~11 active thumb bindings had to be
  consolidated to 4 + outer columns (see PORT.md). This is the biggest
  ergonomic unknown, not a functionality blocker.

## Needs custom QMK C (not expressible in Oryx GUI)

- **`mod_activate` machinery**: HRM hold = modifier + `mod_active` layer,
  with conditional layer (`hebrew`+`mod_active` → `english_alpha`) so
  shortcuts stay English while typing Hebrew. QMK: custom tap-hold +
  `update_tri_layer` in C.
- **Conditional/tri-layers** generally (`hebrew`+`symbols` → `hebrew_symbols`
  was worked around in Oryx by rebinding the thumb on the Hebrew layer).
- **Mod-morphs**: Shift+Bspc→Del, Hebrew Shift+Q→`?` (QMK Key Overrides).
- **Hold-taps with macro actions**: `dict_enter` (tap Enter / hold double-Ctrl
  dictation), `shift_caps`'s slow-CAPS tap.
- **`lang_toggle`** (one key = OS input switch + firmware layer toggle).
- Same-hand HRM chording semantics (`hold-trigger-on-release`) — Chordal Hold
  differs; customizable via `get_chordal_hold()` in C.
- Per-combo `require-prior-idle` (QMK combos lack it; needs custom logic).

## Ports cleanly (Oryx GUI or equivalent setting)

Home-row mods (Chordal Hold ≈ `hold-trigger-key-positions`, Tap Flow ≈
`require-prior-idle-ms`, permissive hold ≈ `balanced`, per-key tapping term),
layer-taps, combos, Caps Word, macros (multi-step, per-step modifiers), mouse
keys/wheel/buttons (global speeds instead of per-key `mouse_slow` values),
tap/hold dual keys incl. modified-key pairs (`app_alt`, screenshot key),
17 layers (Oryx caps at 32), per-key RGB.

## Hybrid Oryx + custom C workflow (if bought)

- ZSA-blessed flow: a git repo where an `oryx` branch tracks the GUI layout
  and `main` carries custom C; GitHub Actions merges + builds; flash with
  Keymapp. GUI tweaking keeps working forever alongside the C.
  https://blog.zsa.io/oryx-custom-qmk-features/
- Keep everything Oryx-expressible in Oryx; put only the irreducible parts in
  C — maximizes GUI editability and keeps training views truthful.
- ZSA provides no support for the C layer.

## Keymapp / heatmap with custom firmware

Verified in the `oryx` module source (github.com/zsa/qmk_modules):

- Key events are sent by **physical position** before keycode processing —
  heat counts can't be corrupted by custom C.
- Layer reporting hooks `layer_state_set`, so layers activated from C
  (`layer_on`) are attributed correctly — **define every layer in Oryx**,
  even ones only C activates, or the UI has no page for them.
- Presses made while a `mod_activate`-style hold is active are attributed to
  that layer's heatmap page (correct, but base-layer heat won't include
  shortcut chords).
- Heatmap records only while Keymapp is running and paired; nothing is stored
  on the board.

## Decision aids

- The Oryx port for visual evaluation: layout `OwJw3` (see PORT.md; compiled
  clean, firmware v25).
- What can't be judged from the visual: HRM feel and the Hebrew mod trick —
  only provable with hardware + the C layer written.
- Claude-friendliness: layout bulk-edits via Oryx GraphQL API (PORT.md
  gotchas), day-to-day custom-C work is plain git — both fully scriptable.
