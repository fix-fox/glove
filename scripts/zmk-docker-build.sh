#!/bin/bash
# Build ZMK firmware locally using Docker.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
BOARD="glove80_lh"
OUTPUT_DIR=""
DOCKER_IMAGE="zmkfirmware/zmk-build-arm:stable"
VOLUME_NAME="zmk-workspace"

while [[ $# -gt 0 ]]; do
    case $1 in
        --board) BOARD="$2"; shift 2 ;;
        --output-dir) OUTPUT_DIR="$2"; shift 2 ;;
        *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
done

if [ -z "$OUTPUT_DIR" ]; then
    OUTPUT_DIR="$(mktemp -d)"
fi
mkdir -p "$OUTPUT_DIR"

if ! docker info >/dev/null 2>&1; then
    echo "ERROR: Docker is not running" >&2
    exit 1
fi

if ! docker image inspect "$DOCKER_IMAGE" >/dev/null 2>&1; then
    echo "Pulling $DOCKER_IMAGE..."
    docker pull "$DOCKER_IMAGE"
fi

echo "Building $BOARD..."
docker run --rm \
    -v "${VOLUME_NAME}:/workspace" \
    -v "${REPO_DIR}/config:/workspace/config:ro" \
    -v "${OUTPUT_DIR}:/output" \
    -w /workspace \
    -e ZEPHYR_BASE=/workspace/zephyr \
    "$DOCKER_IMAGE" \
    bash -c "
        set -e
        if [ ! -f .west/config ]; then
            echo 'Initializing west workspace...'
            west init -l config/ >/dev/null 2>&1
        fi
        echo 'Updating west modules...'
        west update 2>/dev/null
        west zephyr-export >/dev/null 2>&1
        echo 'Building firmware...'
        if ! west build -s zmk/app -b ${BOARD} -d build/${BOARD} -- -DZMK_CONFIG=/workspace/config > /tmp/build.log 2>&1; then
            echo 'Build failed:'
            cat /tmp/build.log
            exit 1
        fi
        cp build/${BOARD}/zephyr/zmk.uf2 /output/${BOARD}-zmk.uf2
        echo 'Build complete.'
    "

echo "Firmware: ${OUTPUT_DIR}/${BOARD}-zmk.uf2"
