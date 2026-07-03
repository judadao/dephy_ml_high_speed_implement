#!/bin/sh
set -eu

simul_bin="${SIMUL_BIN:-../linux_io_device_simul/build_out/linux_io_device_simul}"
script_path="${1:-../linux_io_device_simul/scripts/hand_keyframe_demo.script}"
sample_keyframes="${2:-web/public/demo/sample_keyframes.csv}"
runtime_io="${RUNTIME_IO:-web/public/demo/runtime_io.csv}"
runtime_anchors="${RUNTIME_ANCHORS:-web/public/demo/runtime_anchors.jsonl}"
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

mkdir -p "$(dirname "$sample_keyframes")" "$(dirname "$runtime_io")" "$(dirname "$runtime_anchors")" "${OUTDIR:-build_out}/runtime"
stream="${OUTDIR:-build_out}/runtime/io_device_hand_stream.out"

"$simul_bin" \
    --hand-stream \
    --loop "$loop" \
    --sample-ms "$sample_ms" \
    "$script_path" > "$stream"

"$simul_bin" --record-hand-keyframes "$stream" > "$sample_keyframes"

python3 scripts/generate_runtime_io.py \
    --sample-keyframes "$sample_keyframes" \
    --out "$runtime_io" \
    --seed "${RUNTIME_SEED:-303}" \
    --noise-scale "${NOISE_SCALE:-1.0}" \
    --source io_device_simul

python3 scripts/runtime_io_to_anchor.py \
    --runtime-io "$runtime_io" \
    --out "$runtime_anchors"
