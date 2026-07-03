#!/bin/sh
set -eu

sample_keyframes="${SAMPLE_KEYFRAMES:-web/public/demo/sample_keyframes.csv}"
runtime_io="${RUNTIME_IO:-web/public/demo/runtime_io.csv}"
runtime_anchors="${RUNTIME_ANCHORS:-web/public/demo/runtime_anchors.jsonl}"
segments="${SEGMENTS:-web/public/demo/hand_sequence/prediction_segments.jsonl}"
result="${RESULT:-web/public/demo/hand_sequence/result.json}"
model="${MODEL:-${OUTDIR:-build_out}/hand_sequence/model.json}"
loop="${LOOP:-0}"
sample_ms="${SAMPLE_MS:-500}"

mkdir -p "$(dirname "$sample_keyframes")" "$(dirname "$runtime_io")" "$(dirname "$runtime_anchors")" "$(dirname "$segments")"

python3 scripts/generate_random_hand_keyframes.py \
    --out "$sample_keyframes" \
    --count "${KEYFRAME_COUNT:-16}" \
    --sample-ms "$sample_ms" \
    --seed "${WEB_SEED:-101}" \
    --noise-scale "${SAMPLE_NOISE_SCALE:-0.35}" \
    --mode "${KEYFRAME_MODE:-grasp_can}"

: > "$segments"
: > "$result"
: > "$runtime_io"
: > "$runtime_anchors"
: > "${OUTDIR:-build_out}/runtime/bootstrap_samples.jsonl"

python3 scripts/dephy_hand_realtime_watcher.py \
    --anchors "$runtime_anchors" \
    --model "$model" \
    --out "$segments" \
    --result "$result" \
    --sample-ms "$sample_ms" \
    --frames "${FRAMES:-100}" \
    --bootstrap-samples "${OUTDIR:-build_out}/runtime/bootstrap_samples.jsonl" \
    --truncate &
watcher_pid=$!
trap 'kill "$watcher_pid" 2>/dev/null || true' EXIT

python3 scripts/stream_runtime_io_loop.py \
    --sample-keyframes "$sample_keyframes" \
    --runtime-io "$runtime_io" \
    --runtime-anchors "$runtime_anchors" \
    --sample-ms "$sample_ms" \
    --loop "$loop" \
    --seed "${RUNTIME_SEED:-303}" \
    --noise-scale "${NOISE_SCALE:-1.0}"

kill "$watcher_pid" 2>/dev/null || true
