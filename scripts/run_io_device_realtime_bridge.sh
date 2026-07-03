#!/bin/sh
set -eu

simul_bin="${SIMUL_BIN:-../linux_io_device_simul/build_out/linux_io_device_simul}"
script_path="${1:-../linux_io_device_simul/scripts/hand_keyframe_demo.script}"
out="${2:-web/public/demo/hand_keyframes.csv}"
sample_ms="${SAMPLE_MS:-300}"
loop="${LOOP:-0}"

if [ ! -x "$simul_bin" ]; then
    echo "missing io-device simulator binary: $simul_bin" >&2
    echo "build linux_io_device_simul first or set SIMUL_BIN=/path/to/linux_io_device_simul" >&2
    exit 1
fi

if [ ! -f "$script_path" ]; then
    echo "missing io-device keyframe script: $script_path" >&2
    exit 1
fi

mkdir -p "$(dirname "$out")" "${OUTDIR:-build_out}/runtime"
stream="${OUTDIR:-build_out}/runtime/io_device_hand_stream.out"

"$simul_bin" \
    --hand-stream \
    --loop "$loop" \
    --sample-ms "$sample_ms" \
    "$script_path" > "$stream"

"$simul_bin" --record-hand-keyframes "$stream" > "$out"
