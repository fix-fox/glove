# Glove80 Windows → macOS Migration — Design Spec

**Date:** 2026-05-31
**Branch:** `mac-migration` (merge to `main` only after testing on the Mac)
**Status:** Design approved; pending spec review → implementation plan

## 1. Goal & context

The user is replacing a Windows laptop with a Mac. The Glove80 keymap is currently
Windows-oriented. This project adapts the keymap and surrounding macOS software so that
**as much muscle memory as possible carries over**, with special attention to the
Cmd-vs-Ctrl problem and window switching.

The keyboard is **Mac-only going forward**. We still produce a revert guide
(`docs/OS_MIGRATION.md`) in case the user ever returns to Windows/Linux, and a
`CLAUDE.md` rule to keep that guide accurate.

### Core requirement (from the user)

- Outside the terminal: the **middle finger = Cmd** (so Windows Ctrl+C/V/S muscle memory
  becomes the correct Cmd+C/V/S, on the same finger).
- Inside the terminal: the **middle finger = Ctrl** (so Ctrl+C interrupt, Ctrl+R, tmux
  prefix, etc. stay on the same finger).
- Window switching (`Alt+Tab`) preserved.
- A **consistent experience whether or not a terminal is focused** for launcher / clipboard /
  input-switch actions.
- Achieving part of this in macOS software is acceptable.

## 2. Constraints & key findings (from research)

1. **ZMK has no host-OS or focused-app awareness** (confirmed: ZMK issue #2553 open/unimplemented).
   Therefore the context-dependent part ("Cmd in apps, Ctrl in terminal") **must** be done in
   macOS software — Karabiner-Elements.
2. **Karabiner sees only HID modifiers, not fingers and not which key/macro emitted them.**
   A *global* Cmd↔Ctrl swap would (a) break Cmd+Tab / Spotlight / Mission-Control and
   (b) flip the modifiers our own ZMK macros emit. **Rejected.** Instead: make the keyboard
   emit Mac-correct modifiers, and use Karabiner *only* for a narrow, terminal-scoped swap.
3. **Your muscle memory maps onto the standard Mac order.** Swapping GUI↔CTRL on the home row
   turns the current GACS into **CAGS** (pinky=Ctrl, ring=Alt, middle=Cmd, index=Shift) — both
   the community-standard macOS HRM order *and* a layout that keeps copy/paste on the middle
   finger, with Alt staying on the ring finger (so `Alt+Tab` → `Option+Tab` via AltTab.app).
4. **Mac line/word editing lives on Cmd/Option**, not Home/End (which scroll the document on Mac).
5. Several keys are **dead on macOS** (Print Screen) or **Windows-specific** (`Win+;`, `Win+L`).

## 3. Architecture — three layers, each doing only what it can

| Layer | Responsibility |
|---|---|
| **Keyboard (`config.json`)** | Emit Mac-correct modifiers (CAGS); translate Windows shortcut keycodes and macros to Mac equivalents |
| **Karabiner-Elements** | The one context-dependent thing: swap Cmd↔Ctrl **only when a terminal is frontmost**, scoped to the Glove80 device |
| **Helper apps + macOS settings** | AltTab (window switching), Maccy (clipboard), Caps-Lock input switch, launcher hotkey |

## 4. Keyboard changes (`config.json`, then `npm run generate-firmware`)

> **Implementation note:** match `param1` values **exactly** (`"LGUI"`, `"LCTRL"`, `"RGUI"`,
> `"RCTRL"`). Do **not** substring-match — `LA(LGUI)` / `RA(RGUI)` contain `LGUI`/`RGUI` and
> must be left untouched (see §4.4).

### 4.1 Home-row mods: GACS → CAGS (swap on `hold_tap` `param1`)

Apply positionally to every HRM key (left pinky/middle and right pinky/middle home positions):

- `LGUI` → `LCTRL`  (left pinky)
- `LCTRL` → `LGUI`  (left middle)
- `RGUI` → `RCTRL`  (right pinky)
- `RCTRL` → `RGUI`  (right middle)

Affected layers and keys:

| Layer | Key (param2) | Now | After |
|---|---|---|---|
| default | A | LGUI | LCTRL |
| default | S | LCTRL | LGUI |
| default | E | RCTRL | RGUI |
| default | O | RGUI | RCTRL |
| english_alpha | A | LGUI | LCTRL |
| english_alpha | S | LCTRL | LGUI |
| english_alpha | E | RCTRL | RGUI |
| english_alpha | O | RGUI | RCTRL |
| hebrew | A | LGUI | LCTRL |
| hebrew | K | LCTRL | LGUI |
| hebrew | U | RCTRL | RGUI |
| hebrew | SEMI | RGUI | RCTRL |
| hebrew-alt | COMMA | LGUI | LCTRL |
| hebrew-alt | K | LCTRL | LGUI |
| hebrew-alt | U | RCTRL | RGUI |
| hebrew-alt | A | RGUI | RCTRL |
| cursor | LC(A)→see §4.2 | LGUI | LCTRL |
| cursor | LC(S)→see §4.2 | LCTRL | LGUI |
| symbols | PLUS | RCTRL | RGUI |

The result: middle finger = Cmd, pinky = Ctrl, ring = Alt/Option (unchanged), index = Shift
(unchanged), on both hands.

### 4.2 Windows shortcut keycodes → Mac (`LC(x)` → `LG(x)`)

These bake a Windows Ctrl-shortcut into an explicit keycode (they do **not** go through the
home-row mod, so the §4.1 swap does not affect them).

**`cursor` layer** (shortcut pad) — taps:

| Now | After | Action |
|---|---|---|
| LC(A) | LG(A) | select all |
| LC(B) | LG(B) | (app-specific) |
| LC(C) | LG(C) | copy |
| LC(D) | LG(D) | (app-specific) |
| LC(F) | LG(F) | find |
| LC(G) | LG(G) | (app-specific / find-next) |
| LC(P) | LG(P) | print / command palette |
| LC(R) | LG(R) | reload |
| LC(S) | LG(S) | save |
| LC(T) | LG(T) | new tab |
| LC(V) | LG(V) | paste |
| LC(W) | LG(W) | close tab/window |
| LC(X) | LG(X) | cut |
| LC(Y) | LG(Y) | redo |
| LC(Z) | LG(Z) | undo |
| LA(F4) | LG(Q) | quit app (was Alt+F4 close) |
| LA(LC(V)) | LA(LS(V)) | paste-from-clipboard → **Maccy hotkey** (Option+Shift+V) |

**`mouse` layer** — taps: `LC(C)`→`LG(C)`, `LC(V)`→`LG(V)`, `LC(X)`→`LG(X)`.

### 4.3 Special keys (default & system layers)

| Layer | Key | Now | After | Reason |
|---|---|---|---|---|
| default | lock | LG(L) | LC(LG(Q)) | macOS lock = Ctrl+Cmd+Q |
| default | emoji | LG(SEMI) | LC(LG(SPACE)) | macOS emoji picker = Ctrl+Cmd+Space |
| default | print-screen | PSCRN | LG(LS(N5)) | macOS screenshot toolbar = Cmd+Shift+5 |
| default | launcher thumb | `&lt 15 LC(SPACE)` | `&lt 15 LA(SPACE)` | Flow launcher hotkey = Option+Space (swap-immune) |
| system | print-screen | PRINTSCREEN | LG(LS(N5)) | second Print Screen → Cmd+Shift+5 |

### 4.4 Left unchanged (reviewed, intentionally OS-neutral)

- **`Apps` layer** — `LG(N0..N9)` (Cmd+number) and `LC(LS(LG(letter)))` / `LC(LG(R))`
  "hyperkey" combos consumed by a launcher (Raycast/BTT) on Mac.
- **Inner-column combined mods** `hml LA(LGUI) G`, `hmr RA(RGUI) M` (english_alpha) →
  Option+Cmd on Mac, a deliberate combo. Not part of the 4-finger CAGS row.
- **Media/consumer keys** (`C_PLAY_PAUSE`, `C_VOLUME_*`, `C_MUTE`) — identical on Mac.
- **`C_BRIGHTNESS_INC/DEC`** (system layer) — *start working* on Mac; just verify.
- **Plain `LALT`/`LCTRL`/`LSHFT`** helper keys on numbers/mouse/system layers — Alt→Option
  semantic shift accepted; they remain functional modifiers.
- **`vim_*`, `bt_*`, `rgb_*`, `type_2digits`, `mod_activate`** macros; mod-morphs; `factory_test`.

### 4.5 Macro translations

| Macro | Now (Windows) | After (Mac) | Notes |
|---|---|---|---|
| `lang_toggle` | LGUI+SPACE, then `&tog 3` | tap **CAPS**, then `&tog 3` | Caps Lock = swap-immune input switch (set in macOS Input Sources); flips OS input + hebrew layer together |
| `delete_to_bol` | Shift+Home, Bksp | **Cmd+Backspace** (LGUI+BSPC) | one keystroke on Mac |
| `delete_to_eol` | Shift+End, Bksp | **Ctrl+K** (LCTRL+K) | Cocoa kill-to-EOL; for GUI text fields |
| `select_line` | Home, Shift+End | **Cmd+Left**, then **Shift+Cmd+Right** (LG(LEFT); LS(LG(RIGHT))) | Mac line nav on Cmd |
| `clipboard_history` | Win combo | **Option+Shift+V** (LALT+LSHFT+V) | Maccy hotkey; swap-immune |
| `gemini_tab` | LCTRL+T, `@gemini⇥` | **LGUI+T**, `@gemini⇥` | Chrome new-tab (not terminal → no swap) |
| `flow_bookmark` | LCTRL+SPACE, `b ` | **LALT+SPACE** (Option+Space), `b ` | launcher hotkey; swap-immune; consistent in/out of terminal |
| `v_space_ctrl_t` | `v `, LCTRL+T | `v `, **LGUI+T** | terminal-only; emits Cmd+T which the terminal Karabiner swap flips to **Ctrl+T**. Inverse-authored on purpose. |

## 5. macOS software (documented in `docs/MAC_SETUP.md`, not scripted)

### 5.1 Karabiner-Elements — terminal-only Cmd↔Ctrl swap

A single complex-modification rule:
- **Bidirectional** swap of left+right Command↔Control (so middle→Ctrl and pinky→Cmd in terminal;
  bidirectional keeps `Cmd+V` paste / `Cmd+T` tab available on the pinky in the terminal).
- Gated by `frontmost_application_if` on **iTerm2** (`^com\.googlecode\.iterm2$`). Easy to extend
  (add bundle IDs for Ghostty/WezTerm/etc.; find IDs via Karabiner EventViewer).
- **Scoped to the Glove80 device** (`device_if` on its vendor/product ID, read from EventViewer)
  so the laptop's built-in keyboard is unaffected.
- `from.modifiers.optional: ["any"]` so chords still combine.

Skeleton (device_if IDs filled in on the Mac):

```json
{
  "description": "Glove80: in iTerm2, swap Cmd<->Ctrl (middle=Ctrl, pinky=Cmd)",
  "manipulators": [
    { "type": "basic",
      "conditions": [
        { "type": "frontmost_application_if", "bundle_identifiers": ["^com\\.googlecode\\.iterm2$"] },
        { "type": "device_if", "identifiers": [{ "vendor_id": 0, "product_id": 0 }] }
      ],
      "from": { "key_code": "left_command", "modifiers": { "optional": ["any"] } },
      "to": [{ "key_code": "left_control" }] },
    { "type": "basic",
      "conditions": [ /* same two conditions */ ],
      "from": { "key_code": "left_control", "modifiers": { "optional": ["any"] } },
      "to": [{ "key_code": "left_command" }] }
    /* repeat for right_command / right_control */
  ]
}
```

### 5.2 Helper apps & settings

- **AltTab** (`brew install --cask alt-tab`) — Windows-style window switching, trigger
  **Option+Tab** (Option physically maps to where Alt was; preserves muscle memory), Thumbnails view.
- **Maccy** (`brew install --cask maccy`) — clipboard history, hotkey **Option+Shift+V**
  (matches `clipboard_history` macro and the cursor-layer paste-from-clipboard key).
- **Karabiner-Elements** (`brew install --cask karabiner-elements`) — rule from §5.1.
- **macOS Input Sources** — enable "Use Caps Lock to switch to and from [Hebrew]"
  (Settings → Keyboard → Input Sources → Edit). Drives `lang_toggle`.
- **Launcher** (Raycast/Alfred/Spotlight) — set invoke hotkey to **Option+Space** (swap-immune;
  matches the launcher thumb key and `flow_bookmark`).
- **Emoji picker** — Ctrl+Cmd+Space is the macOS default (verify; matches the `LG(SEMI)` remap).
- **Flashing on Mac** — macOS Ventura 13.1+ to drag-copy UF2; keep the UF2 filename short
  (Error -43 otherwise); the board rebooting before macOS confirms the copy is normal. If
  Bluetooth fails on an M4 / older-Intel Mac, set `BLE_CTLR_PHY_2M=n` in the Layout Editor
  advanced config and use latest production firmware.

## 6. Deliverables

1. **Branch `mac-migration`**: `config.json` (§4) + regenerated `config/glove80.keymap` &
   `config/glove80.conf`. Merge to `main` only after testing on the Mac.
2. **`docs/MAC_SETUP.md`** — terse checklist for the Claude session on the new Mac: flash
   firmware, `brew install` the three casks, paste the Karabiner JSON, configure AltTab /
   Maccy / Caps-Lock input switch / launcher hotkey, plus the flashing gotchas.
3. **`docs/OS_MIGRATION.md`** — revert to Windows/Linux: reverse §4.1 (CAGS→GACS), §4.2–4.5
   (Mac→Windows reverse table), and disable/uninstall the macOS software.
4. **`CLAUDE.md` line** — e.g.: *"When changing OS-specific keyboard behavior (home-row mod
   order, Windows/Mac shortcut keycodes, macro modifier translations), update
   `docs/OS_MIGRATION.md` so the revert instructions stay accurate."*

## 7. Known limitations (documented)

- **VS Code integrated terminal** can't be distinguished from its editor by Karabiner (same
  bundle ID). VS Code stays on the normal/Cmd side; handle terminal-in-VSCode via VS Code's own
  keybindings if needed.
- **Macro ↔ terminal-swap entanglement:** any macro emitting Cmd/Ctrl *while a terminal is
  focused* is also swapped. Handled: `v_space_ctrl_t` is inverse-authored; the swap-immune
  actions (launcher, clipboard, input switch) use Option-based / Caps Lock triggers; the
  `cursor`-layer Cmd shortcuts are GUI-app-oriented and may misbehave if used inside a terminal
  (edge case).
- **Caps Lock input switch** toggles between exactly two sources (fits English↔Hebrew).

## 8. Testing plan (on the Mac, after flashing)

1. Copy/paste/save in a GUI app → Cmd on the middle finger.
2. `Ctrl+C` interrupt + `Ctrl+R` in iTerm2 → middle finger acts as Ctrl; `Cmd+V` paste works on pinky.
3. Confirm the built-in laptop keyboard is **not** swapped in iTerm2 (device scoping).
4. `Option+Tab` → AltTab window switcher.
5. Caps Lock → input source switches **and** hebrew layer toggles (`lang_toggle`).
6. Maccy via Option+Shift+V; launcher via Option+Space (both in and out of terminal).
7. Each translated macro: `delete_to_bol/eol`, `select_line`, `gemini_tab` (Chrome),
   `flow_bookmark`, `v_space_ctrl_t` (→ Ctrl+T in terminal).
8. Special keys: lock (Ctrl+Cmd+Q), emoji (Ctrl+Cmd+Space), Print Screen (Cmd+Shift+5).
