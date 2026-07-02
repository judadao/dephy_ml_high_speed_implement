#!/bin/sh
set -eu

outdir="${OUTDIR:-build_out}/hand_sequence"
mkdir -p "$outdir"

python3 scripts/generate_hand_sequence_dataset.py \
    --positive-out "$outdir/positive.jsonl" \
    --negative-out "$outdir/negative.jsonl" \
    --count 40 \
    --seed 31 > "$outdir/dataset_metrics.json"

python3 scripts/train_hand_sequence_model.py \
    --positive "$outdir/positive.jsonl" \
    --negative "$outdir/negative.jsonl" \
    --out "$outdir/model.json" \
    --iterations 45 \
    --seed 37 > "$outdir/training_metrics.json"

grep -q '"format": "dephy_hand_sequence_model_v1"' "$outdir/model.json"
grep -q '"success_rate"' "$outdir/training_metrics.json"

python3 scripts/dephy_hand_sequence_predict.py \
    --keyframes examples/hand/hand_keyframes.csv \
    --model "$outdir/model.json" \
    --out "$outdir/prediction.csv" \
    --result "$outdir/result.json" \
    --render-ms 16

grep -q '^frame_t_ms,target_frame,palm_x' "$outdir/prediction.csv"
grep -q '"format": "dephy_hand_sequence_result_v1"' "$outdir/result.json"
grep -q '"success": true' "$outdir/result.json"
