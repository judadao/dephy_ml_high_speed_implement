#!/bin/sh
set -eu

outdir="${OUTDIR:-build_out}/web_realtime_flow"
mkdir -p "$outdir"

grep -Fq 'useState(PLAY_MODES.REALTIME)' web/src/main.jsx
grep -Fq 'Realtime Demo' web/src/demoConstants.js
grep -Fq 'TAB_CONTRACTS.map' web/src/main.jsx
grep -Fq 'current runtime IO keyframe + current prediction segment + current prediction row' web/src/demoConstants.js
grep -Fq 'currentRuntimeAnchorIndex = realtimeMode' web/src/main.jsx
grep -Fq 'visibleRuntimeAnchors = realtimeMode && currentRuntimeAnchor ? [currentRuntimeAnchor] : keyframes' web/src/main.jsx
grep -Fq 'current runtime io' web/src/main.jsx
grep -Fq 'current keyframe from io' web/src/main.jsx
grep -Fq 'prediction for current keyframe' web/src/main.jsx
grep -Fq 'current prediction rows' web/src/main.jsx
grep -Fq 'predictionLag' web/src/main.jsx
grep -Fq 'segment.toAnchor.anchor_id === item.anchor_id' web/src/main.jsx
grep -Fq 'segmentPlaybackRef.current = { segmentIndex: latestIndex' web/src/main.jsx
grep -Fq 'VISIBLE_ROW_LIMIT = 15' web/src/demoConstants.js
grep -Fq 'DEMO_RECORD_LIMIT = 15' web/src/demoConstants.js
grep -Fq 'PREDICTION_WINDOW_BEFORE = 7' web/src/demoConstants.js
grep -Fq 'PREDICTION_WINDOW_AFTER = 7' web/src/demoConstants.js
grep -Fq 'const demoRecordLimit = 15;' web/vite.config.js
grep -Fq 'tailDemoText(event, data)' web/vite.config.js
grep -Fq 'parseRuntimeAnchorsJsonl(text, DEMO_RECORD_LIMIT)' web/src/main.jsx
grep -Fq 'parsePredictionSegmentsJsonl(text, DEMO_RECORD_LIMIT)' web/src/main.jsx
grep -Fq 'pausedFrameIndex / segment.frames.length' web/src/main.jsx
if grep -Fq 'segmentPlaybackRef.current = { ...playback, startTime: performance.now(), lastFrameIndex: -1 };' web/src/main.jsx; then
    echo "playback resume still resets to segment start" >&2
    exit 1
fi

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
