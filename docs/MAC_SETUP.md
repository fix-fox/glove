# Mac Setup Checklist (Glove80 migration)

Run this after the `mac-migration` branch is flashed. Terse on purpose — hand it to a Claude
session on the new Mac. Background and rationale: `docs/superpowers/specs/2026-05-31-macos-migration-design.md`.

The keyboard now emits **Mac-correct modifiers** (middle finger = Cmd). macOS software handles
the rest: the terminal Cmd↔Ctrl swap, window switching, clipboard, and input switching.

## 1. Flash the firmware

- [ ] Merge `mac-migration` → `main` (only after you've confirmed it works) or just flash from the branch.
- [ ] Build/download the `.uf2` (GitHub Actions or local build).
- [ ] Put each half into bootloader (Magic + … per MoErgo docs) and drag the `.uf2` onto the
      `GLV80LHBOOT` / `GLV80RHBOOT` drive.
- [ ] **Mac gotchas:** needs macOS **Ventura 13.1+** to drag-copy the UF2. If you get **Error -43**,
      shorten the UF2 filename. The half rebooting *before* macOS confirms the copy is **normal**.
- [ ] **Bluetooth on M4 / older-Intel Macs:** if BLE won't connect, set advanced config
      `BLE_CTLR_PHY_2M=n` in the MoErgo Layout Editor and use the latest production firmware. (USB is unaffected.)

## 2. Install helper apps

```bash
brew install --cask karabiner-elements alt-tab maccy
```

## 3. Karabiner-Elements — optional per-combo terminal swaps

**Default: no Karabiner rule.** With CAGS home-row mods the **pinky = Ctrl** and the
**middle finger = Cmd**, and modifiers pass through unchanged in every app — so both terminal and
GUI shortcuts already work without a swap:

- Shell control keys on the **pinky**: `Ctrl+C` interrupt, `Ctrl+R` search, `Ctrl+A`/`Ctrl+E`
  line start/end, `Ctrl+D`, `Ctrl+L`, `Ctrl+U`/`Ctrl+W`/`Ctrl+K`.
- iTerm2's native Cmd shortcuts on the **middle finger**, identical to every GUI app:
  `Cmd+T` tab, `Cmd+W` close, `Cmd+C`/`Cmd+V` copy/paste, `Cmd+F` find.

> Earlier revisions used a *global* iTerm Cmd↔Ctrl swap. That broke native Cmd shortcuts (e.g.
> `Cmd+T` became `Ctrl+T`) and forced the Cmd/Ctrl fingers to swap roles per-app. Dropped — start
> with no swap; add only the surgical per-combo rules below if a specific combo feels wrong.

### Optional: individual per-combo swaps

Add a rule only if muscle memory keeps reaching for the **Cmd/middle** position when you want a
shell Ctrl behavior in the terminal. Remap *that one combo*, not the whole modifier. **Cost:** the
swap takes that combo away from its native iTerm meaning (e.g. `Cmd+C → Ctrl+C` loses iTerm
`Cmd+C` = copy; rely on mouse-select auto-copy instead).

- [ ] Grant Karabiner Input Monitoring / Accessibility permissions (only when you add a rule).
- [ ] Scope to the Glove80 via `device_if`: find `vendor_id`/`product_id` in **Karabiner-EventViewer
      → Devices**, so the laptop's built-in keyboard is unaffected.
- [ ] Find your terminal's bundle ID (EventViewer → "Frontmost Application"); iTerm2 is
      `com.googlecode.iterm2`.
- [ ] One combo per manipulator. Template for `Cmd+C → Ctrl+C` in iTerm2, in
      `~/.config/karabiner/assets/complex_modifications/glove80-terminal-swap.json`:

```json
{
  "title": "Glove80 — per-combo terminal swaps",
  "rules": [
    {
      "description": "Glove80: Cmd+C -> Ctrl+C in iTerm2",
      "manipulators": [
        {
          "type": "basic",
          "conditions": [
            { "type": "frontmost_application_if", "bundle_identifiers": ["^com\\.googlecode\\.iterm2$"] },
            { "type": "device_if", "identifiers": [{ "vendor_id": 0, "product_id": 0 }] }
          ],
          "from": { "key_code": "c", "modifiers": { "mandatory": ["left_command"] } },
          "to": [{ "key_code": "c", "modifiers": ["left_control"] }]
        }
      ]
    }
  ]
}
```

- [ ] Add more combos: one manipulator each (copy the block, change `from`/`to` `key_code`).
- [ ] Add more terminals: append their bundle IDs to `bundle_identifiers`.
- [ ] **VS Code caveat:** Karabiner can't tell the VS Code editor from its integrated terminal
      (same bundle ID). Leave VS Code **out** of these rules; handle terminal-in-VSCode via VS
      Code's own `keybindings.json` if needed.

## 4. AltTab — Windows-style window switching

- [ ] Open AltTab, grant Accessibility + Screen Recording permissions.
- [ ] Set the trigger to **Option+Tab** (Option physically sits where Alt was — preserves
      `Alt+Tab` muscle memory). Appearance: Thumbnails.

## 5. Maccy — clipboard history (Win+V equivalent)

- [ ] Set the popup hotkey to **Option+Shift+V**. (This matches the keyboard's
      `clipboard_history` macro and the `cursor`-layer paste-from-clipboard key, and is immune to
      the terminal Cmd↔Ctrl swap, so it behaves the same in and out of the terminal.)

## 6. macOS settings

- [ ] **Input switching (English ↔ Hebrew):** ensure **"Select the previous input source" is
      Ctrl+Space** (macOS default; Settings → Keyboard → Keyboard Shortcuts → Input Sources). The
      `lang_toggle` key emits **Ctrl+Space** (OS input switch) and toggles the keyboard's Hebrew layer
      together. Assumes exactly two input sources (English + Hebrew). Caps-Lock switching is *not* used
      — macOS ignores a quick Caps Lock tap, so a macro tap of it was unreliable.
- [ ] **Launcher (Raycast / Alfred / Spotlight):** set the invoke hotkey to **Option+Space**.
      The dedicated launcher thumb key and the `flow_bookmark` macro both emit Option+Space
      (swap-immune → consistent in and out of the terminal).
- [ ] **Emoji picker:** confirm Ctrl+Cmd+Space opens it (macOS default; matches the remapped `Win+;` key).
- [ ] **Dictation:** Settings → Keyboard → **Dictation → On**, then set **Shortcut → "Press Control
      Key Twice."** This is **not** the macOS default (the default is *Press Globe/Fn twice*, which the
      keyboard can't emit), so it must be set explicitly. Two keys emit the double-tap of Control to
      match it: **holding the right Enter thumb (key 75)** and the Apps-layer dictation key (key 69).
- [ ] **Caps Lock:** the two shift thumb keys (54/55) emit Caps Lock on tap, Shift on hold. macOS
      deliberately ignores a too-brief Caps Lock press, so the tap fires through a macro (`caps_mac`)
      that holds Caps Lock ~150 ms. The 39+40 combo (`&kp CAPS`) is the held-duration fallback.
- [ ] Optional: Settings → Keyboard → "Use F1, F2 as standard function keys" if you want plain F-keys.

## 7. Verify (smoke test)

1. GUI app: `Cmd+C` / `Cmd+V` / `Cmd+S` on the **middle** finger.
2. iTerm2: `Ctrl+C` interrupt + `Ctrl+R` on the **pinky**; `Cmd+T` new tab + `Cmd+V` paste on the
   **middle** finger (native, identical to GUI apps).
3. No Karabiner swap active by default — middle = Cmd and pinky = Ctrl behave the same in and out
   of the terminal.
4. `Option+Tab` → AltTab window switcher.
5. `lang_toggle` key (emits Ctrl+Space) → input source switches **and** Hebrew layer toggles.
6. Maccy via `Option+Shift+V`; launcher via `Option+Space` (both inside and outside iTerm2).
7. Macros: `delete_to_bol`/`delete_to_eol`/`select_line`, `gemini_tab` (Chrome new tab),
   `flow_bookmark`, `v_space_ctrl_t` (→ `Ctrl+T` inside the terminal).
8. Special keys: lock (`Ctrl+Cmd+Q`), emoji (`Ctrl+Cmd+Space`), screenshot menu (`Cmd+Shift+5`,
   tap key 72) and region/window capture (`Cmd+Shift+4`, **hold** key 72).
9. Dictation: **hold the right Enter thumb (key 75)** → the macOS dictation overlay (microphone)
   appears (also available via the Apps layer: hold the launcher thumb, tap key 69). Requires the
   Dictation shortcut set to "Press Control Key Twice" (see §6) — this is **not** the macOS default,
   so if nothing happens that setting is the first thing to check.
10. Caps Lock: tap a shift thumb (key 54 or 55) → Caps Lock toggles (LED/indicator on).
