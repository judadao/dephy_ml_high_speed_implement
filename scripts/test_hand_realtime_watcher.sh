#!/bin/sh
set -eu

outdir="${OUTDIR:-build_out}/hand_realtime"
model_dir="${OUTDIR:-build_out}/hand_sequence"
mkdir -p "$outdir"

if [ ! -f "$model_dir/model.json" ]; then
    OUTDIR="${OUTDIR:-build_out}" sh scripts/test_hand_sequence_model.sh >/dev/null
fi

KEYFRAME_COUNT=4 SAMPLE_MS=10 WEB_SEED=515 NOISE_SCALE=1.0 KEYFRAME_MODE=gesture LOOP=1 OUTDIR="${OUTDIR:-build_out}" \
    sh scripts/run_hand_realtime_keyframe_simul.sh "$outdir/keyframes.csv" &
sim_pid=$!

python3 scripts/dephy_hand_realtime_watcher.py \
    --keyframes "$outdir/keyframes.csv" \
    --model "$model_dir/model.json" \
    --out "$outdir/prediction_segments.jsonl" \
    --result "$outdir/result.json" \
    --render-ms 16 \
    --sample-ms 10 \
    --frames 20 \
    --poll-ms 20 \
    --max-keyframes 4 \
    --correction-threshold 0 \
    --truncate

wait "$sim_pid"

grep -q '"segment_type":"bootstrap"' "$outdir/prediction_segments.jsonl"
grep -q '"segment_type":"correction"' "$outdir/prediction_segments.jsonl"
grep -q '"segment_type":"confirmed"' "$outdir/prediction_segments.jsonl"
grep -q '"mode": "realtime"' "$outdir/result.json"
grep -q '"bootstrap_segments": 1' "$outdir/result.json"
grep -q '"confirmed_segments": 3' "$outdir/result.json"
grep -q '"correction_segments": 1' "$outdir/result.json"
grep -q '"success": true' "$outdir/result.json"
