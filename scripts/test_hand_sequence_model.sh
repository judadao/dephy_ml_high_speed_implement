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
    --render-ms 16 \
    --frames 1000

grep -q '^frame_t_ms,target_frame,palm_x' "$outdir/prediction.csv"
grep -q '"format": "dephy_hand_sequence_result_v1"' "$outdir/result.json"
grep -q '"success": true' "$outdir/result.json"
test "$(($(wc -l < "$outdir/prediction.csv") - 1))" -eq 4005
grep -q '"frames_between_keyframes": 1000' "$outdir/result.json"
grep -q '"intermediate_prediction_frames": 4000' "$outdir/result.json"
grep -q '"prediction_frames": 4005' "$outdir/result.json"

python3 scripts/generate_random_hand_keyframes.py \
    --out "$outdir/noisy_keyframes.csv" \
    --template examples/hand/hand_keyframes.csv \
    --count 5 \
    --sample-ms 300 \
    --seed 101 \
    --noise-scale 1.0

python3 scripts/dephy_hand_sequence_predict.py \
    --keyframes "$outdir/noisy_keyframes.csv" \
    --model "$outdir/model.json" \
    --out "$outdir/noisy_prediction.csv" \
    --result "$outdir/noisy_result.json" \
    --render-ms 16 \
    --frames 1000

grep -q '"success": true' "$outdir/noisy_result.json"
test "$(($(wc -l < "$outdir/noisy_prediction.csv") - 1))" -eq 4005

python3 scripts/generate_random_hand_keyframes.py \
    --out "$outdir/full_random_keyframes.csv" \
    --count 5 \
    --sample-ms 300 \
    --seed 202 \
    --noise-scale 1.0

python3 scripts/dephy_hand_sequence_predict.py \
    --keyframes "$outdir/full_random_keyframes.csv" \
    --model "$outdir/model.json" \
    --out "$outdir/full_random_prediction.csv" \
    --result "$outdir/full_random_result.json" \
    --render-ms 16 \
    --frames 1000

grep -q '"success": true' "$outdir/full_random_result.json"
test "$(($(wc -l < "$outdir/full_random_prediction.csv") - 1))" -eq 4005

python3 scripts/generate_random_hand_keyframes.py \
    --out "$outdir/gesture_keyframes.csv" \
    --count 12 \
    --sample-ms 300 \
    --seed 303 \
    --noise-scale 1.25 \
    --mode gesture

python3 scripts/dephy_hand_sequence_predict.py \
    --keyframes "$outdir/gesture_keyframes.csv" \
    --model "$outdir/model.json" \
    --out "$outdir/gesture_prediction.csv" \
    --result "$outdir/gesture_result.json" \
    --render-ms 16 \
    --frames 1000

grep -q '"success": true' "$outdir/gesture_result.json"
test "$(($(wc -l < "$outdir/gesture_prediction.csv") - 1))" -eq 11012
grep -q '"intermediate_prediction_frames": 11000' "$outdir/gesture_result.json"
