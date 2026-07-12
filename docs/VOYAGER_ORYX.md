# Voyager / Oryx Port (evaluation)

A port of the Glove80 layout (`config.json`) to a ZSA Voyager Oryx layout, built
to evaluate whether the Voyager can cover the current key functionality.
Generated and pushed by `scripts/voyager-oryx/push_layout.py`.

**Layout:** https://configure.zsa.io/voyager/layouts/OwJw3/latest/0

- Anyone with the link can view it. It is compiled (firmware v25) and read-only.
- To tweak it: click **Modify layout** on that page (or sign in to a ZSA account
  first so the fork lands in your account and persists there).
- To regenerate from scratch: `python3 scripts/voyager-oryx/push_layout.py --fork`
  (prints a fresh layout URL; edit the `LAYERS` table in the script first).
  Compile **last** — compiling freezes the revision; API edits then return
  `Unauthorized` and you must fork again.

## Layer mapping (ZMK → Voyager)

| Voyager | Title   | ZMK layer(s)        | Notes |
|---------|---------|---------------------|-------|
| 0       | Base    | 0 default           | see thumb/outer-column consolidation below |
| 1       | Hebrew  | 3 hebrew            | toggled by key 0 (`TG`, was `&tog 3`) |
| 2       | Numbers | 4 numbers           | hold left thumb Tab |
| 3       | Symbols | 5 symbols           | hold right thumb Space |
| 4       | HebSym  | 6 hebrew_symbols    | conditional layer replaced: Hebrew layer rebinds the Space thumb to `LT(HebSym)` |
| 5       | System  | 7 system            | hold right thumb Enter; + relocated Lock (`⌃⌘Q`) |
| 6       | Mouse   | 8 mouse             | `TG` on base outer-right; `TO(Base)` exits (was `&tog 8` combo) |
| 7       | Macros  | 10 macros           | hold D / H (as on Glove80) |
| 8       | Cursor  | 14 cursor           | hold left thumb Backspace; Del moved to left thumb *on this layer* |
| 9       | Apps    | 15 apps             | hold G / M on Base, G / H on Hebrew (see below) |

Dropped: 1 magic (BT/RGB — no BT on Voyager, RGB via Oryx UI), 2 factory_test,
9 original_default, 11 mouse_slow, 12 mod_active + 13 english_alpha (custom-C
machinery, see below), 16 key_index (ZMK-configurator debug tool).

## Thumb consolidation (12 → 4)

| Voyager thumb | Binding            | Replaces (Glove80) |
|---------------|--------------------|--------------------|
| Left 24       | `LT(Numbers, Tab)` | `&lt 4 TAB` |
| Left 25       | `LT(Cursor, Bspc)` | `&lt_mm_bspc_shift_del 14` (shift→Del morph dropped) |
| Right 50      | `LT(Symbols, Space)` | `&lt 5 SPACE` |
| Right 51      | `LT(System, Enter)`  | `dict_enter` Enter + `&lt 7 ESC` system access |

Displaced thumb functions: Esc → outer top-left; Grave → outer bottom-left;
`shift_caps` → outer home-left (tap Caps, hold Shift); screenshot `⌘⇧4/⌘⇧5`
tap/hold → outer bottom-right; Ctrl+Cmd+Space → top-right (its Glove80 column);
mouse toggle `TG(Mouse)` → outer top-right; Del → Cursor layer left thumb;
dictation (double-Ctrl macro) → Apps layer left thumb;
`LA(SPACE)`+Apps thumb → dropped, Apps now on G/M holds (Base) and G/H (Hebrew).

## Not represented (needs custom QMK C, or dropped)

- **`mod_activate` machinery** (hold HRM → mod + `mod_active` layer; Hebrew+mod
  → English alphas): home-row mods here are plain mod-taps. The C
  implementation is the known follow-up if the Voyager is bought.
- **Mod-morphs**: Shift+Bspc→Del, Hebrew Shift+Q→`?` (QMK key overrides in C).
- **`lang_toggle`** combined OS-input-switch + layer toggle: split into a plain
  Ctrl+Space key (Macros layer, "Lang") + the `TG` Hebrew key on Base.
- **Combos** (caps word T+N, caps lock G+M, toggles): Oryx supports combos but
  they weren't scripted; add via the Combos UI if wanted.
- **mouse_slow layer** and per-key mouse speeds: Oryx has global mouse-speed
  settings instead.
- ZMK per-behavior timing nuances (`hold-trigger-on-release`, per-combo
  `require-prior-idle`): approximated by Oryx's Chordal Hold (thumbs excluded),
  Tap Flow 100 ms, permissive hold, tapping term 200 (280 per-key on HRMs).

## Oryx GraphQL API notes (for future automation)

Endpoint `https://oryx.zsa.io/graphql`, `Origin: https://configure.zsa.io`.
Anonymous layouts need no auth and are world-editable until compiled.

- `createLayout(title, revisionHashId, parentHashId, geometry)` — fork.
- `updateLayer(hashId, newKeys, position, title)` — replace a layer's 52 keys.
- `createLayer(newKeys, revisionHashId, position, title)` — append a layer.
- `updateLayoutTitle`, `updateRevisionConfig(hashId, config)`.

Gotchas (all hit while building this):

1. `config` value types must match the settings schema — `flowTap` is a
   number (ms); sending `true` makes the web app hang on "Loading" for
   everyone opening the layout.
2. Single-step macros are silently stored as `{}` (key wiped) — use a plain
   modified key for one-chord actions.
3. `MO`/`TG`-style keys must point to a **higher** layer; self/backward
   references flag "Invalid key assignments detected" (compile disabled).
   Use `TO` to jump backwards (e.g. exit-Mouse).
4. Compiling freezes the revision — push everything first, compile last.
5. The layer view renders a key hatched ("preceded") when a lower layer holds
   that same position to reach this layer — display only, not data loss.
