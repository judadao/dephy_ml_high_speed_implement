#!/bin/sh
set -eu

outdir="${OUTDIR:-build_out}/runtime_io_loop"
mkdir -p "$outdir"

python3 scripts/generate_random_hand_keyframes.py \
    --out "$outdir/sample_keyframes.csv" \
    --count 4 \
    --sample-ms 300 \
    --seed 818 \
    --noise-scale 0.35 \
    --mode grasp_can

python3 scripts/stream_runtime_io_loop.py \
    --sample-keyframes "$outdir/sample_keyframes.csv" \
    --runtime-io "$outdir/runtime_io.csv" \
    --runtime-anchors "$outdir/runtime_anchors.jsonl" \
    --sample-ms 300 \
    --loop 2 \
    --seed 919 \
    --noise-scale 1.0 \
    --no-sleep

test "$(($(wc -l < "$outdir/runtime_io.csv") - 1))" -eq 8
test "$(wc -l < "$outdir/runtime_anchors.jsonl")" -eq 8
grep -q '"anchor_id":"runtime_io_000000"' "$outdir/runtime_anchors.jsonl"
grep -q '"anchor_id":"runtime_io_000007"' "$outdir/runtime_anchors.jsonl"
tail -n 1 "$outdir/runtime_anchors.jsonl" | grep -q '"t_ms":2100'
