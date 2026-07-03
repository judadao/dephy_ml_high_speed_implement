#!/bin/sh
set -eu

sample_keyframes="${SAMPLE_KEYFRAMES:-web/public/demo/sample_keyframes.csv}"
runtime_io="${RUNTIME_IO:-web/public/demo/runtime_io.csv}"
runtime_anchors="${RUNTIME_ANCHORS:-web/public/demo/runtime_anchors.jsonl}"
segments="${SEGMENTS:-web/public/demo/hand_sequence/prediction_segments.jsonl}"
result="${RESULT:-web/public/demo/hand_sequence/result.json}"
model="${MODEL:-${OUTDIR:-build_out}/hand_sequence/model.json}"

mkdir -p "$(dirname "$sample_keyframes")" "$(dirname "$runtime_io")" "$(dirname "$runtime_anchors")" "$(dirname "$segments")"

python3 scripts/generate_random_hand_keyframes.py \
    --out "$sample_keyframes" \
    --count "${KEYFRAME_COUNT:-64}" \
    --sample-ms "${SAMPLE_MS:-500}" \
    --seed "${WEB_SEED:-101}" \
    --noise-scale "${SAMPLE_NOISE_SCALE:-0.35}" \
    --mode "${KEYFRAME_MODE:-grasp_can}"

python3 scripts/generate_runtime_io.py \
    --sample-keyframes "$sample_keyframes" \
    --out "$runtime_io" \
    --seed "${RUNTIME_SEED:-303}" \
    --noise-scale "${NOISE_SCALE:-1.0}" \
    --source simulated_runtime_io

python3 scripts/runtime_io_to_anchor.py \
    --runtime-io "$runtime_io" \
    --out "$runtime_anchors"

python3 scripts/dephy_hand_realtime_watcher.py \
    --anchors "$runtime_anchors" \
    --model "$model" \
    --out "$segments" \
    --result "$result" \
    --sample-ms "${SAMPLE_MS:-500}" \
    --frames "${FRAMES:-100}" \
    --max-keyframes "${KEYFRAME_COUNT:-64}" \
    --bootstrap-samples "${OUTDIR:-build_out}/runtime/bootstrap_samples.jsonl" \
    --truncate
