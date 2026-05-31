# Glove80 macOS Migration — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans or subagent-driven-development. Steps use checkbox syntax.

**Goal:** Adapt the Glove80 `config.json` for macOS (CAGS home-row mods, Windows→Mac shortcut keycodes, macro translations), regenerate firmware, and document Mac setup + revert.

**Architecture:** A deterministic Node transform script edits `config.json` (preserving its exact `\uXXXX`-escaped 2-space formatting), then `npm run generate-firmware` regenerates `config/glove80.keymap` & `.conf`. Verification is by grepping the regenerated keymap. Docs are authored by hand.

**Tech Stack:** Node, jq, the project's `npm run generate-firmware`.

**Spec:** `docs/superpowers/specs/2026-05-31-macos-migration-design.md`

---

### Task 1: Transform script for `config.json`

**Files:**
- Create: `scripts/macos-migrate.mjs`

The script loads `config.json`, applies the transforms below, and writes it back using a serializer that re-escapes non-ASCII (verified byte-identical to the current formatting).

Transforms:
1. **Home-row CAGS swap** — every layer, `tap.type==="hold_tap"`, swap `param1` exactly: `LGUI↔LCTRL`, `RGUI↔RCTRL`. (Leaves `LA(LGUI)`/`RA(RGUI)` and Shift/Alt mods untouched.)
2. **`cursor` & `mouse` layers** — any `keyCode` or `param2` matching `^LC\((.+)\)$` → `LG($1)`.
3. **Special keycodes (exact match, by layer):**
   - cursor: `LA(F4)`→`LG(Q)`; `LA(LC(V))`→`LA(LS(V))`
   - default: `LG(L)`→`LC(LG(Q))`; `LG(SEMI)`→`LC(LG(SPACE))`; `PSCRN`→`LG(LS(N5))`; `LC(SPACE)`→`LA(SPACE)`
   - system: `PRINTSCREEN`→`LG(LS(N5))`
4. **Macros** — replace `steps` for `lang_toggle`, `delete_to_bol`, `delete_to_eol`, `select_line`, `clipboard_history`; string-swap the modifier in `gemini_tab` (`LCTRL`→`LGUI`), `flow_bookmark` (`LCTRL`→`LALT`), `v_space_ctrl_t` (`LCTRL`→`LGUI`).

- [ ] **Step 1: Write `scripts/macos-migrate.mjs`** (full content in execution).
- [ ] **Step 2: Run it:** `node scripts/macos-migrate.mjs`
  Expected: prints a summary of counts (HRM swaps, LC→LG, specials, macros) and "config.json written".
- [ ] **Step 3: Verify formatting diff is semantic-only:** `git diff --stat config.json` shows only `config.json` changed; spot-check `git diff config.json` contains no whitespace-only churn.

### Task 2: Regenerate firmware

- [ ] **Step 1:** `npm run generate-firmware`
  Expected: writes `config/glove80.keymap` and `config/glove80.conf`, exits 0.
- [ ] **Step 2: Verify CAGS in keymap:** `grep -n 'hml LCTRL A' config/glove80.keymap` → present; `grep -n 'hml LGUI A' config/glove80.keymap` → absent.
- [ ] **Step 3: Verify shortcut conversions:**
  - `grep 'kp LG(C)' config/glove80.keymap` (cursor/mouse copy) → present
  - `grep -E 'LG\(LS\(N5\)\)' config/glove80.keymap` (two screenshots) → 2 hits
  - `grep 'LC(LG(Q))' config/glove80.keymap` (lock) → present
  - `grep 'LC(LG(SPACE))' config/glove80.keymap` (emoji) → present
  - `grep -c 'LC(' config/glove80.keymap` is much lower than before (cursor/mouse Ctrl-shortcuts gone)
- [ ] **Step 4: Verify macros:** `grep -A1 'lang_toggle' config/glove80.keymap` shows `&kp CAPS` + `&tog 3`; `delete_to_bol` shows `LG`/`BSPC`; `flow_bookmark` shows `LALT`+`SPACE`.
- [ ] **Step 5: Build check:** `npx tsc --noEmit` exits 0 (per project feedback: tsc is sufficient for config/data edits).
- [ ] **Step 6: Commit** `config.json`, `config/glove80.keymap`, `config/glove80.conf`, `scripts/macos-migrate.mjs`.

### Task 3: `docs/MAC_SETUP.md` (new-Mac checklist)

- [ ] Write a terse checklist: flash firmware (+ Mac gotchas), `brew install --cask` karabiner-elements / alt-tab / maccy, paste the Karabiner JSON (iTerm2 + device-scoped, with EventViewer instructions for the device IDs), configure AltTab (Option+Tab), Maccy (Option+Shift+V), Caps-Lock input switch, launcher hotkey (Option+Space), emoji (verify Ctrl+Cmd+Space), then run the §8 test plan. Commit.

### Task 4: `docs/OS_MIGRATION.md` (revert to Windows/Linux)

- [ ] Write the reverse guide: CAGS→GACS (reverse §4.1), the Mac→Windows reverse table for §4.2–4.5, macro reversions, and disable/uninstall the macOS software. Note that `node scripts/macos-migrate.mjs` is one-directional (manual revert or re-import the pre-migration config). Commit.

### Task 5: CLAUDE.md rule

- [ ] Append to `CLAUDE.md`: a line instructing that OS-specific keyboard changes must update `docs/OS_MIGRATION.md`. Commit.

### Task 6: Final verification

- [ ] Re-run `jq` to confirm no remaining home-row `hold_tap` `param1` of `LGUI`/`RGUI` on left/`RCTRL`/`LCTRL` mismatched; confirm `git status` clean except intended files; summarize.
