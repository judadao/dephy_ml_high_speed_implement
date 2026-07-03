#!/bin/sh
set -eu

outdir="${OUTDIR:-build_out}/web_realtime_flow"
mkdir -p "$outdir"

grep -Fq 'useState("realtime")' web/src/main.jsx
grep -Fq 'Realtime Demo' web/src/main.jsx
grep -Fq 'currentRuntimeAnchorIndex = realtimeMode ? Math.max(0, keyframes.length - 1)' web/src/main.jsx
grep -Fq 'visibleRuntimeAnchors = realtimeMode && currentRuntimeAnchor ? [currentRuntimeAnchor] : keyframes' web/src/main.jsx
grep -Fq 'current runtime io' web/src/main.jsx

make -n -f Makefile.linux web-realtime-demo KEYFRAME_COUNT=5 > "$outdir/make_web_realtime_demo.txt"
grep -q 'run_hand_runtime_loop_demo.sh' "$outdir/make_web_realtime_demo.txt"
grep -q 'LOOP=0' "$outdir/make_web_realtime_demo.txt"
grep -q 'npm --prefix web run dev' "$outdir/make_web_realtime_demo.txt"

make -n -f Makefile.linux web KEYFRAME_COUNT=5 > "$outdir/make_web.txt"
grep -q 'run_hand_runtime_loop_demo.sh' "$outdir/make_web.txt"
grep -q 'LOOP=0' "$outdir/make_web.txt"
grep -q 'npm --prefix web run dev' "$outdir/make_web.txt"

python3 scripts/generate_random_hand_keyframes.py \
    --out "$outdir/sample_keyframes.csv" \
    --count 5 \
    --sample-ms 300 \
    --seed 818 \
    --noise-scale 0.35 \
    --mode grasp_can

python3 scripts/stream_runtime_io_loop.py \
    --sample-keyframes "$outdir/sample_keyframes.csv" \
    --runtime-io "$outdir/runtime_io.csv" \
    --runtime-anchors "$outdir/runtime_anchors.jsonl" \
    --sample-ms 300 \
    --loop 3 \
    --seed 919 \
    --noise-scale 1.0 \
    --no-sleep

test "$(($(wc -l < "$outdir/runtime_io.csv") - 1))" -eq 15
test "$(wc -l < "$outdir/runtime_anchors.jsonl")" -eq 15
grep -q '"anchor_id":"runtime_io_000014"' "$outdir/runtime_anchors.jsonl"
