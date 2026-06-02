# Mac dictation key + Mac-only flash script

**Date:** 2026-06-02
**Context:** Continuation of the macOS migration (`docs/MAC_SETUP.md`,
`docs/OS_MIGRATION.md`, spec `2026-05-31-macos-migration-design.md`). Two small, independent
changes bundled because both finish the Mac migration.

## Part 1 — Dictation key

### Goal
Add a key that triggers macOS Dictation.

### Mechanism
macOS Dictation's default trigger is "Press Control Key Twice." A keymap can't emit the
double-modifier-tap gesture as a normal keypress, but a ZMK **macro** can: tap Control, then tap
Control again. This uses the macOS default with **no System Settings change**.

Caveat (documented, not blocking): the same double-Control gesture during fast normal typing would
also start dictation. Control is a pinky home-row hold here, so an accidental double-tap is
unlikely.

If the user has changed the system trigger away from the default (e.g. to Fn or Right-Command),
the macro's keycode must change to match — out of scope unless that's the case.

### Design
- **New macro `dictation`** in `config.json` → `macros`:
  - step 1: `tap` `&kp LCTRL`
  - step 2: `tap` `&kp LCTRL`
- **Binding**: `layers[15]` (Apps), position **69**, tap → `macro` `dictation`. Currently `trans`.
- Reachable by holding the launcher thumb (`Option+Space`, default layer pos 73, `&mo 15`) then
  tapping key 69. All other layers leave pos 69 untouched (it's a thumb key — mod-morph/`&mo 14`
  — on the default layer; the Apps layer override only applies while the launcher thumb is held).

### Why the Apps layer / pos 69
User-chosen. The Apps layer is the "Hyper-key launcher" layer (each alpha key emits
`Ctrl+Shift+Cmd+<letter>` to focus an app); all 26 letter slots are already used, so dictation goes
on a free non-letter slot. Pos 69 is free there.

## Part 2 — Mac-only flash script

### Goal
`scripts/glove-flash.sh` is currently Windows/WSL-only. Make it run natively on macOS.

### Current Windows/WSL coupling (to remove)
- Device presence: `cmd.exe /c "if exist D:\\ (exit 0) else (exit 1)"`
- Path translation + copy: `wslpath -w "$FILE"` then `cmd.exe /c copy "$WIN_PATH" "D:\\"`
- Both halves share the single `D:` drive letter.

### macOS model
The Glove80 bootloader mounts each half as a **named volume**:
- Left half → `/Volumes/GLV80LHBOOT`
- Right half → `/Volumes/GLV80RHBOOT`

This is more precise than the Windows shared `D:` — each half is detected by its own path.

### Changes
- `wait_for_device` / `wait_for_disconnect`: take a **volume path** argument; poll with
  `[ -d "$path" ]` instead of `cmd.exe`.
- Copy firmware with `cp "$FIRMWARE_FILE" "$VOLUME/"` (no `wslpath`, no `cmd.exe`).
- Single-half (default) flash: wait on / copy to `/Volumes/GLV80LHBOOT`.
- Full flash: right half waits on / copies to `/Volumes/GLV80RHBOOT`; left half uses
  `/Volumes/GLV80LHBOOT`.
- Update the on-screen instructions that reference `D:\` to name the macOS volumes.
- Note in output (and docs) that macOS may show a "Disk not ejected properly" warning when the
  half reboots after copy — harmless.

### Untouched (OS-agnostic)
`npm run generate-firmware`, the local Docker build (`zmk-docker-build.sh`), the remote GitHub
Actions path (gh/jq), argument parsing, and the overall flow.

## Docs to update
- `docs/MAC_SETUP.md`: add Dictation to the §7 smoke-test list (hold launcher thumb → key 69 →
  dictation overlay appears).
- `docs/OS_MIGRATION.md`:
  - Macros reverse table: add `dictation` row (macOS = double-tap `LCTRL`; Windows/Linux = no
    direct equivalent / use the OS's own dictation trigger).
  - Add a short note that `scripts/glove-flash.sh` was rewritten Mac-only; reverting to Windows/WSL
    means restoring the `cmd.exe`/`wslpath`/`D:` logic from git history (pre commit on this branch).

## Out of scope
- Cross-platform flash script (explicitly chose Mac-only replacement).
- Changing the macOS Dictation system trigger from its default.
- Any keymap change beyond the single dictation binding.

## Verification
- `npm run generate-firmware` regenerates `config/glove80.keymap` / `.conf` without error; the
  generated keymap contains the `dictation` macro and the pos-69 binding on the Apps layer.
- Existing test suite (`npm test`) passes.
- Flash script: `bash -n scripts/glove-flash.sh` parses; manual smoke flash on the Mac (left half,
  default mode) copies the UF2 and the half reboots.
