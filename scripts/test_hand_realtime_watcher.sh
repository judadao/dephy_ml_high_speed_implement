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
    --bootstrap-samples "$outdir/bootstrap_samples.jsonl" \
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
grep -q '"format":"dephy_bootstrap_prior_sample_v1"' "$outdir/bootstrap_samples.jsonl"
grep -q '"state": "stopped"' "$outdir/result.json"

python3 scripts/generate_runtime_io.py \
    --sample-keyframes "$outdir/keyframes.csv" \
    --out "$outdir/runtime_io.csv" \
    --seed 616 \
    --noise-scale 1.0
python3 scripts/runtime_io_to_anchor.py \
    --runtime-io "$outdir/runtime_io.csv" \
    --out "$outdir/runtime_anchors.jsonl"
python3 scripts/dephy_hand_realtime_watcher.py \
    --anchors "$outdir/runtime_anchors.jsonl" \
    --model "$model_dir/model.json" \
    --out "$outdir/anchor_segments.jsonl" \
    --result "$outdir/anchor_result.json" \
    --render-ms 16 \
    --sample-ms 10 \
    --frames 20 \
    --poll-ms 20 \
    --max-keyframes 4 \
    --truncate
grep -q '"anchors_seen": 4' "$outdir/anchor_result.json"
grep -q '"from_anchor"' "$outdir/anchor_segments.jsonl"

cp "$outdir/keyframes.csv" "$outdir/keyframes_partial.csv"
printf 'partial,999,' >> "$outdir/keyframes_partial.csv"
python3 scripts/dephy_hand_realtime_watcher.py \
    --keyframes "$outdir/keyframes_partial.csv" \
    --model "$model_dir/model.json" \
    --out "$outdir/partial_segments.jsonl" \
    --result "$outdir/partial_result.json" \
    --render-ms 16 \
    --sample-ms 10 \
    --frames 5 \
    --poll-ms 20 \
    --max-keyframes 4 \
    --truncate
grep -q '"confirmed_segments": 3' "$outdir/partial_result.json"

python3 scripts/dephy_hand_realtime_watcher.py \
    --keyframes "$outdir/keyframes.csv" \
    --model "$model_dir/model.json" \
    --out "$outdir/prediction_segments.jsonl" \
    --result "$outdir/resume_result.json" \
    --render-ms 16 \
    --sample-ms 10 \
    --frames 20 \
    --poll-ms 20 \
    --max-keyframes 4 \
    --resume
grep -q '"segments_written": 5' "$outdir/resume_result.json"
