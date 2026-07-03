#!/bin/sh
set -eu

outdir="${OUTDIR:-build_out}/runtime_anchor"
model_dir="${OUTDIR:-build_out}/hand_sequence"
mkdir -p "$outdir"

if [ ! -f "$model_dir/model.json" ]; then
    OUTDIR="${OUTDIR:-build_out}" sh scripts/test_hand_sequence_model.sh >/dev/null
fi

python3 scripts/generate_random_hand_keyframes.py \
    --out "$outdir/sample_keyframes.csv" \
    --count 5 \
    --sample-ms 300 \
    --seed 616 \
    --noise-scale 0.35 \
    --mode grasp_can

python3 scripts/generate_runtime_io.py \
    --sample-keyframes "$outdir/sample_keyframes.csv" \
    --out "$outdir/runtime_io.csv" \
    --seed 717 \
    --noise-scale 1.0

python3 scripts/runtime_io_to_anchor.py \
    --runtime-io "$outdir/runtime_io.csv" \
    --out "$outdir/runtime_anchors.jsonl"

grep -q '"format":"dephy_runtime_anchor_v1"' "$outdir/runtime_anchors.jsonl"

python3 scripts/dephy_hand_realtime_watcher.py \
    --anchors "$outdir/runtime_anchors.jsonl" \
    --model "$model_dir/model.json" \
    --out "$outdir/prediction_segments.jsonl" \
    --result "$outdir/result.json" \
    --frames 40 \
    --sample-ms 300 \
    --max-keyframes 5 \
    --truncate

grep -q '"from_anchor"' "$outdir/prediction_segments.jsonl"
grep -q '"target_kind":"predicted_anchor"' "$outdir/prediction_segments.jsonl"
grep -q '"target_kind":"observed_anchor"' "$outdir/prediction_segments.jsonl"
grep -q '"anchors_seen": 5' "$outdir/result.json"
grep -q '"confirmed_segments": 4' "$outdir/result.json"
