#!/bin/bash
# Generate ZMK firmware, build (locally or via GitHub Actions), and flash to Glove80.

set -e

REPO="fix-fox/glove"
FIRMWARE_PATTERN="glove80_lh*.uf2"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
FULL=false
MODE="local"  # default to local Docker build

while [[ $# -gt 0 ]]; do
    case $1 in
        --full)   FULL=true; shift ;;
        --local)  MODE="local"; shift ;;
        --remote) MODE="remote"; shift ;;
        *) echo "Usage: $0 [--local|--remote] [--full]"; exit 1 ;;
    esac
done

wait_for_device() {
    local timeout=$1
    local elapsed=0
    while ! cmd.exe /c "if exist D:\\ (exit 0) else (exit 1)" 2>/dev/null; do
        sleep 1
        elapsed=$((elapsed + 1))
        if [ $elapsed -ge $timeout ]; then
            echo ""
            echo "Error: Timeout waiting for device at D:\\"
            exit 1
        fi
        printf "\r  Waiting... %ds" $elapsed
    done
    echo ""
}

wait_for_disconnect() {
    local timeout=$1
    local elapsed=0
    while cmd.exe /c "if exist D:\\ (exit 0) else (exit 1)" 2>/dev/null; do
        sleep 1
        elapsed=$((elapsed + 1))
        if [ $elapsed -ge $timeout ]; then
            break
        fi
    done
}

cd "$REPO_DIR"

# ── Generate keymap ──────────────────────────────────────────────────────────
echo "Generating firmware files..."
npm run generate-firmware --silent

# ── Build firmware ───────────────────────────────────────────────────────────
TEMP_DIR=$(mktemp -d)
cleanup() { rm -rf "$TEMP_DIR"; }
trap cleanup EXIT

if [ "$MODE" = "local" ]; then
    # ── Local Docker build ──
    "$SCRIPT_DIR/zmk-docker-build.sh" --board glove80_lh --output-dir "$TEMP_DIR"
    FIRMWARE_FILE="$TEMP_DIR/glove80_lh-zmk.uf2"

    if $FULL; then
        "$SCRIPT_DIR/zmk-docker-build.sh" --board glove80_rh --output-dir "$TEMP_DIR"
        RH_FIRMWARE_FILE="$TEMP_DIR/glove80_rh-zmk.uf2"
    fi
else
    # ── Remote build via GitHub Actions ──
    CHANGED_FILES="config/glove80.keymap config/glove80.conf"
    CHANGES=$(git diff --name-only -- $CHANGED_FILES 2>/dev/null)
    UNTRACKED=$(git ls-files --others --exclude-standard -- $CHANGED_FILES 2>/dev/null)
    ALL_CHANGES=$(echo -e "${CHANGES}\n${UNTRACKED}" | sed '/^$/d' | sort -u)

    if [ -n "$ALL_CHANGES" ]; then
        echo ""
        echo "Changed files:"
        for f in $ALL_CHANGES; do
            echo "  $f"
        done
        echo ""
        git diff -- $CHANGED_FILES 2>/dev/null
        echo ""
        read -p "Commit and push? [Y/n] " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Nn]$ ]]; then
            echo "Aborted."
            exit 0
        fi
        git add -- $CHANGED_FILES 2>/dev/null
        git commit -m "keymap: update from configurator"
        git push
    else
        echo "No keymap changes — checking latest build."
    fi

    echo ""
    echo "Checking for workflow runs..."

    RUN_INFO=$(gh run list --repo "$REPO" --workflow build.yml --limit 1 --json databaseId,status,conclusion,headBranch,createdAt,displayTitle)
    RUN_ID=$(echo "$RUN_INFO" | jq -r '.[0].databaseId')
    STATUS=$(echo "$RUN_INFO" | jq -r '.[0].status')
    CONCLUSION=$(echo "$RUN_INFO" | jq -r '.[0].conclusion')
    BRANCH=$(echo "$RUN_INFO" | jq -r '.[0].headBranch')
    CREATED_AT=$(echo "$RUN_INFO" | jq -r '.[0].createdAt')
    TITLE=$(echo "$RUN_INFO" | jq -r '.[0].displayTitle')

    CREATED_HUMAN=$(date -d "$CREATED_AT" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "$CREATED_AT")

    if [ "$STATUS" = "in_progress" ] || [ "$STATUS" = "queued" ]; then
        echo "Build in progress: $TITLE"
        echo "Waiting for build to complete..."
        gh run watch "$RUN_ID" --repo "$REPO" --exit-status
        CONCLUSION=$(gh run view "$RUN_ID" --repo "$REPO" --json conclusion -q '.conclusion')
    fi

    if [ "$CONCLUSION" != "success" ]; then
        echo "Error: Latest build failed (status: $CONCLUSION)"
        echo "Check: https://github.com/$REPO/actions/runs/$RUN_ID"
        exit 1
    fi

    echo ""
    echo "=== Latest successful build ==="
    echo "  Commit:  $TITLE"
    echo "  Branch:  $BRANCH"
    echo "  Time:    $CREATED_HUMAN"
    echo "  Run:     https://github.com/$REPO/actions/runs/$RUN_ID"
    echo ""

    if $FULL; then
        read -p "Download and flash BOTH halves? [Y/n] " -n 1 -r
    else
        read -p "Download and flash this firmware? [Y/n] " -n 1 -r
    fi
    echo ""
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        echo "Aborted."
        exit 0
    fi

    echo "Downloading firmware artifact..."
    gh run download "$RUN_ID" --repo "$REPO" --dir "$TEMP_DIR"

    FIRMWARE_FILE=$(find "$TEMP_DIR" -name "$FIRMWARE_PATTERN" -type f | head -1)

    if [ -z "$FIRMWARE_FILE" ]; then
        echo "Error: Could not find left hand firmware ($FIRMWARE_PATTERN)"
        echo "Contents of download:"
        find "$TEMP_DIR" -type f
        exit 1
    fi

    echo "Found firmware: $(basename "$FIRMWARE_FILE")"

    if $FULL; then
        RH_FIRMWARE_FILE=$(find "$TEMP_DIR" -name "glove80_rh*.uf2" -type f | head -1)
        if [ -z "$RH_FIRMWARE_FILE" ]; then
            echo "Error: Could not find right hand firmware (glove80_rh*.uf2)"
            echo "Contents of download:"
            find "$TEMP_DIR" -type f
            exit 1
        fi
        echo "Found firmware: $(basename "$RH_FIRMWARE_FILE")"
    fi
fi

# ── Flash ────────────────────────────────────────────────────────────────────
if $FULL; then
    echo ""
    echo "══════════════════════════════════════════════════════════════"
    echo "  Full flash — both halves via power-up bootloader method"
    echo "══════════════════════════════════════════════════════════════"

    # === RIGHT HALF ===
    echo ""
    echo "── Step 1/2: Right Half ─────────────────────────────────────"
    echo ""
    echo "  1. Switch OFF the right half"
    echo "  2. Connect USB-C cable to the right half"
    echo "  3. Hold two keys: C3R3 + C6R6 (I + PgDn on default QWERTY)"
    echo "  4. While holding, switch the right half ON"
    echo "  5. Release — look for a slow pulsing red LED"
    echo ""
    echo "Waiting for bootloader device at D:\\ ..."

    wait_for_device 120

    echo "Device detected! Copying right-hand firmware..."
    RH_WIN_PATH=$(wslpath -w "$RH_FIRMWARE_FILE")
    cmd.exe /c copy "$RH_WIN_PATH" "D:\\" > /dev/null

    echo "Right half done! Waiting for it to reboot..."
    sleep 2
    wait_for_disconnect 30

    # === LEFT HALF ===
    echo ""
    echo "── Step 2/2: Left Half ──────────────────────────────────────"
    echo ""
    echo "  1. Disconnect USB from the right half"
    echo "  2. Switch OFF the left half"
    echo "  3. Connect USB-C cable to the left half"
    echo "  4. Hold two keys: C6R6 + C3R3 (Magic + E on default QWERTY)"
    echo "  5. While holding, switch the left half ON"
    echo "  6. Release — look for a slow pulsing red LED"
    echo ""
    echo "Waiting for bootloader device at D:\\ ..."

    wait_for_device 120

    echo "Device detected! Copying left-hand firmware..."
    FIRMWARE_WIN_PATH=$(wslpath -w "$FIRMWARE_FILE")
    cmd.exe /c copy "$FIRMWARE_WIN_PATH" "D:\\" > /dev/null

    echo ""
    echo "══════════════════════════════════════════════════════════════"
    echo "  Both halves flashed!"
    echo "══════════════════════════════════════════════════════════════"

    # ── Factory reset ────────────────────────────────────────────────
    echo ""
    echo "── Step 3/4: Factory Reset — Left Half ──────────────────────"
    echo ""
    echo "  1. Power OFF both halves"
    echo "  2. Hold C6R6 + C3R2 (Magic + 3 on default QWERTY) on the left half"
    echo "  3. While holding, switch the left half ON"
    echo "  4. Keep holding for 5 seconds"
    echo "  5. Power OFF the left half"
    echo ""
    echo "── Step 4/4: Factory Reset — Right Half ─────────────────────"
    echo ""
    echo "  1. Power OFF both halves"
    echo "  2. Hold C6R6 + C3R2 (PgDn + 8 on default QWERTY) on the right half"
    echo "  3. While holding, switch the right half ON"
    echo "  4. Keep holding for 5 seconds"
    echo "  5. Power OFF the right half"
    echo ""
    echo "── Re-pairing ───────────────────────────────────────────────"
    echo ""
    echo "  1. Power ON both halves simultaneously"
    echo "  2. Press Magic + T to enable RGB — verify both halves light up"
    echo "  3. Press Magic + T again to disable RGB"
    echo "  4. Wait at least 1 minute for configuration to persist"
    echo ""
    echo "Done!"
else
    echo ""
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
fi
