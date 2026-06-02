# Mac Dictation Key + Mac-only Flash Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a macOS Dictation key to the Glove80 keymap and rewrite the firmware-flash script to run natively on macOS instead of Windows/WSL.

**Architecture:** A new ZMK `dictation` macro double-taps Left-Control (macOS's default "Press Control Key Twice" dictation trigger), bound on the Apps layer at position 69. The flash script swaps Windows/WSL device handling (`cmd.exe`, `wslpath`, `D:\`) for macOS bootloader volumes (`/Volumes/GLV80LHBOOT`, `/Volumes/GLV80RHBOOT`) and plain `cp`. Both are edits to existing files — `config.json` (data, regenerated to `config/glove80.keymap`) and `scripts/glove-flash.sh`.

**Tech Stack:** TypeScript + Zod (config schema/generator), Vitest (tests), Bash (flash script), ZMK (firmware).

**Spec:** `docs/superpowers/specs/2026-06-02-mac-dictation-and-flash-design.md`

---

## File Structure

- `config.json` — **modify**: add `dictation` macro to `macros`; set Apps layer (index 15) key 69 to the macro. Source of truth; never edit generated files.
- `config/glove80.keymap` — **regenerated** by `npm run generate-firmware` (do not hand-edit).
- `src/lib/dictation.test.ts` — **create**: guards the macro definition, the binding, and that it reaches the generated keymap.
- `scripts/glove-flash.sh` — **modify**: replace WSL/`cmd.exe`/`D:` logic with macOS volumes + `cp`.
- `docs/MAC_SETUP.md` — **modify**: add Dictation to the smoke-test list.
- `docs/OS_MIGRATION.md` — **modify**: add reverse-table rows for the macro and the flash-script rewrite.

---

## Task 1: Dictation macro + binding in config.json

**Files:**
- Create: `src/lib/dictation.test.ts`
- Modify: `config.json` (macros array; layer index 15, key 69)
- Regenerate: `config/glove80.keymap`

- [ ] **Step 1: Write the failing test**

Create `src/lib/dictation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { generateKeymap } from "./generator";
import { migrateConfig } from "./migrations";
import { KeyboardConfigSchema } from "../types/schema";

// Vitest runs from the repo root, so config.json resolves the same way the
// generate-firmware script resolves it.
const config = KeyboardConfigSchema.parse(JSON.parse(readFileSync("config.json", "utf-8")));
migrateConfig(config);

describe("dictation key", () => {
  it("defines a dictation macro that double-taps Left-Control", () => {
    const macro = config.macros?.find((m) => m.name === "dictation");
    expect(macro).toBeDefined();
    expect(macro!.steps).toEqual([
      { directive: "tap", bindings: ["&kp LCTRL"] },
      { directive: "tap", bindings: ["&kp LCTRL"] },
    ]);
  });

  it("binds dictation on the Apps layer at position 69", () => {
    const apps = config.layers.find((l) => l.name === "Apps");
    expect(apps).toBeDefined();
    expect(apps!.keys[69]).toEqual({
      tap: { type: "macro", macroName: "dictation" },
      hold: null,
    });
  });

  it("emits the macro and binding into the generated keymap", () => {
    const result = generateKeymap(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keymap).toContain("dictation: dictation {");
      expect(result.keymap).toContain("&macro_tap &kp LCTRL");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- dictation`
Expected: FAIL — `dictation` macro is undefined and Apps key 69 is `{tap:{type:"trans"},hold:null}`.

- [ ] **Step 3: Edit config.json (append macro + set binding)**

Run this Python snippet from the repo root — it appends the macro and sets the binding deterministically by array index (config.json is ~10k lines; editing by index avoids fragile text matching):

```bash
python3 - <<'PY'
import json

with open("config.json") as f:
    c = json.load(f)

# 1) Append the dictation macro (idempotent).
if not any(m.get("name") == "dictation" for m in c["macros"]):
    c["macros"].append({
        "id": "c59722a2-be23-4409-9b0a-c36450ef8d61",
        "name": "dictation",
        "label": "DICTATION",
        "steps": [
            {"directive": "tap", "bindings": ["&kp LCTRL"]},
            {"directive": "tap", "bindings": ["&kp LCTRL"]},
        ],
    })

# 2) Bind it on the Apps layer (name "Apps"), key index 69.
apps = next(l for l in c["layers"] if l["name"] == "Apps")
assert apps["keys"][69] == {"tap": {"type": "trans"}, "hold": None}, \
    f"Apps key 69 is not free: {apps['keys'][69]}"
apps["keys"][69] = {"tap": {"type": "macro", "macroName": "dictation"}, "hold": None}

with open("config.json", "w") as f:
    json.dump(c, f, indent=2)
    f.write("\n")
PY
```

Note: this rewrites `config.json` with 2-space indentation. If the existing file uses a different indent and the diff is noisy, re-run with the repo's indent (inspect `git diff config.json` — the only *semantic* changes must be the new macro and key 69).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- dictation`
Expected: PASS (all three tests).

- [ ] **Step 5: Regenerate firmware and verify the keymap**

Run: `npm run generate-firmware`
Expected: prints `Wrote config/glove80.keymap`.

Run: `grep -n "dictation" config/glove80.keymap`
Expected: shows the `dictation: dictation { ... }` macro block and a `&dictation` binding in the Apps layer.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS (no regressions).

- [ ] **Step 7: Commit**

```bash
git add config.json config/glove80.keymap src/lib/dictation.test.ts
git commit -m "feat: add macOS dictation key (double-tap Ctrl) on Apps layer"
```

---

## Task 2: Rewrite glove-flash.sh for macOS

**Files:**
- Modify: `scripts/glove-flash.sh`

No Vitest unit test (Bash script). Verification is `bash -n` (syntax) plus `grep` assertions that the Windows/WSL constructs are gone and the macOS volumes are present.

- [ ] **Step 1: Define the volume paths**

In `scripts/glove-flash.sh`, immediately after the argument-parsing `while` loop closes (the line `done` at line ~20, before `wait_for_device()`), add:

```bash
LH_VOL="/Volumes/GLV80LHBOOT"
RH_VOL="/Volumes/GLV80RHBOOT"
```

- [ ] **Step 2: Replace `wait_for_device` and `wait_for_disconnect`**

Replace the entire current `wait_for_device()` function (the version that polls with `cmd.exe /c "if exist D:\\ ..."`) with:

```bash
wait_for_device() {
    local vol=$1
    local timeout=$2
    local elapsed=0
    while [ ! -d "$vol" ]; do
        sleep 1
        elapsed=$((elapsed + 1))
        if [ $elapsed -ge $timeout ]; then
            echo ""
            echo "Error: Timeout waiting for bootloader volume at $vol"
            exit 1
        fi
        printf "\r  Waiting... %ds" $elapsed
    done
    echo ""
}
```

Replace the entire current `wait_for_disconnect()` function with:

```bash
wait_for_disconnect() {
    local vol=$1
    local timeout=$2
    local elapsed=0
    while [ -d "$vol" ]; do
        sleep 1
        elapsed=$((elapsed + 1))
        if [ $elapsed -ge $timeout ]; then
            break
        fi
    done
}
```

- [ ] **Step 3: Update the FULL-flash right half (copy block)**

In the `if $FULL; then` branch, the right-half section currently reads:

```bash
    echo "Waiting for bootloader device at D:\\ ..."

    wait_for_device 120

    echo "Device detected! Copying right-hand firmware..."
    RH_WIN_PATH=$(wslpath -w "$RH_FIRMWARE_FILE")
    cmd.exe /c copy "$RH_WIN_PATH" "D:\\" > /dev/null

    echo "Right half done! Waiting for it to reboot..."
    sleep 2
    wait_for_disconnect 30
```

Replace it with:

```bash
    echo "Waiting for bootloader volume at $RH_VOL ..."

    wait_for_device "$RH_VOL" 120

    echo "Device detected! Copying right-hand firmware..."
    cp "$RH_FIRMWARE_FILE" "$RH_VOL/"

    echo "Right half done! Waiting for it to reboot..."
    echo "(macOS may warn 'Disk not ejected properly' — that's normal.)"
    sleep 2
    wait_for_disconnect "$RH_VOL" 30
```

- [ ] **Step 4: Update the FULL-flash left half (copy block)**

In the same `if $FULL; then` branch, the left-half section currently reads:

```bash
    echo "Waiting for bootloader device at D:\\ ..."

    wait_for_device 120

    echo "Device detected! Copying left-hand firmware..."
    FIRMWARE_WIN_PATH=$(wslpath -w "$FIRMWARE_FILE")
    cmd.exe /c copy "$FIRMWARE_WIN_PATH" "D:\\" > /dev/null
```

Replace it with:

```bash
    echo "Waiting for bootloader volume at $LH_VOL ..."

    wait_for_device "$LH_VOL" 120

    echo "Device detected! Copying left-hand firmware..."
    cp "$FIRMWARE_FILE" "$LH_VOL/"
    echo "(macOS may warn 'Disk not ejected properly' — that's normal.)"
```

- [ ] **Step 5: Update the single-half (default) flash block**

In the `else` branch (single-half flash), the section currently reads:

```bash
    echo "Put the LEFT hand in bootloader mode:"
    echo "  1. Hold the bottom-left key (magic key)"
    echo "  2. While holding, tap the top-left key"
    echo "  3. Release both — keyboard mounts as GLV80LHBOOT (D:)"
    echo ""
    echo "Waiting for device at D:\\ ..."

    wait_for_device 60

    echo "Device detected! Copying firmware..."
    FIRMWARE_WIN_PATH=$(wslpath -w "$FIRMWARE_FILE")
    cmd.exe /c copy "$FIRMWARE_WIN_PATH" "D:\\" > /dev/null

    echo ""
    echo "Firmware copied. The keyboard will reboot automatically."
    echo "Done!"
```

Replace it with:

```bash
    echo "Put the LEFT hand in bootloader mode:"
    echo "  1. Hold the bottom-left key (magic key)"
    echo "  2. While holding, tap the top-left key"
    echo "  3. Release both — keyboard mounts as GLV80LHBOOT ($LH_VOL)"
    echo ""
    echo "Waiting for bootloader volume at $LH_VOL ..."

    wait_for_device "$LH_VOL" 60

    echo "Device detected! Copying firmware..."
    cp "$FIRMWARE_FILE" "$LH_VOL/"

    echo ""
    echo "Firmware copied (macOS may warn 'Disk not ejected properly' — normal)."
    echo "The keyboard will reboot automatically."
    echo "Done!"
```

- [ ] **Step 6: Verify syntax and that Windows constructs are gone**

Run: `bash -n scripts/glove-flash.sh`
Expected: no output (valid syntax).

Run: `grep -nE 'cmd\.exe|wslpath|D:\\\\' scripts/glove-flash.sh`
Expected: no matches (exit code 1 / no lines).

Run: `grep -nE 'GLV80LHBOOT|GLV80RHBOOT|cp "' scripts/glove-flash.sh`
Expected: shows the new `/Volumes/...` paths and `cp` copy commands.

- [ ] **Step 7: Commit**

```bash
git add scripts/glove-flash.sh
git commit -m "build: rewrite glove-flash.sh for macOS (volumes + cp)"
```

---

## Task 3: Update docs

**Files:**
- Modify: `docs/MAC_SETUP.md`
- Modify: `docs/OS_MIGRATION.md`

- [ ] **Step 1: Add Dictation to the MAC_SETUP smoke test**

In `docs/MAC_SETUP.md`, in the `## 7. Verify (smoke test)` numbered list, append a new item after the current item 8 ("Special keys: ..."):

```markdown
9. Dictation: hold the launcher thumb (`Option+Space` key) to reach the Apps layer, tap key 69 →
   the macOS dictation overlay (microphone) appears. Uses the default "Press Control Key Twice"
   trigger; if it does nothing, check System Settings → Keyboard → Dictation → Shortcut is still
   set to the Control double-tap.
```

- [ ] **Step 2: Add the macro reverse-table row in OS_MIGRATION**

In `docs/OS_MIGRATION.md`, in the `### Macros (reverse)` table, add a row at the end of the table body:

```markdown
| `dictation` | double-tap `LCTRL` (macOS "Press Control twice") | no direct equivalent — bind to the target OS's dictation/speech shortcut, or remove the key |
```

- [ ] **Step 3: Add the flash-script note in OS_MIGRATION**

In `docs/OS_MIGRATION.md`, append a new subsection after the `## macOS software to disable when leaving the Mac` section:

```markdown
## Flash script (`scripts/glove-flash.sh`)

Rewritten **macOS-only**: it detects the bootloader halves at `/Volumes/GLV80LHBOOT` /
`/Volumes/GLV80RHBOOT` and copies the UF2 with `cp`. To flash from Windows/WSL again, restore the
pre-rewrite version from git history (the commit "build: rewrite glove-flash.sh for macOS") — that
version polled `cmd.exe /c "if exist D:\"` and copied via `wslpath` + `cmd.exe /c copy ... D:\`.
```

- [ ] **Step 4: Commit**

```bash
git add docs/MAC_SETUP.md docs/OS_MIGRATION.md
git commit -m "docs: dictation key + mac-only flash in setup/migration guides"
```

---

## Final verification

- [ ] `npm test` — full suite passes (includes the new `dictation.test.ts`).
- [ ] `npm run generate-firmware` — regenerates cleanly; `config/glove80.keymap` contains the `dictation` macro and `&dictation` on the Apps layer.
- [ ] `bash -n scripts/glove-flash.sh` — passes; no `cmd.exe`/`wslpath`/`D:\` remain.
- [ ] (Manual, on the Mac hardware) flash the left half in default mode: the script waits on
      `/Volumes/GLV80LHBOOT`, copies the UF2, and the half reboots. Then test the dictation key.
