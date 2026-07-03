#!/bin/sh
set -eu

outdir="${OUTDIR:-build_out}/web_realtime_flow"
mkdir -p "$outdir"

grep -Fq 'useState(PLAY_MODES.REALTIME)' web/src/main.jsx
grep -Fq 'Realtime Demo' web/src/demoConstants.js
grep -Fq 'tabContracts.map' web/src/PlaybackToolbar.jsx
grep -Fq 'current runtime IO keyframe + current prediction segment + current prediction row' web/src/demoConstants.js
grep -Fq 'currentRuntimeAnchorIndexForDisplay({ realtimeMode' web/src/main.jsx
grep -Fq 'if (!realtimeMode)' web/src/demoDisplay.js
grep -Fq 'visibleRuntimeAnchors = realtimeMode && currentRuntimeAnchor ? [currentRuntimeAnchor] : keyframes' web/src/main.jsx
grep -Fq 'current runtime io' web/src/RealtimeDemoTab.jsx
grep -Fq 'current keyframe from io' web/src/RealtimeDemoTab.jsx
grep -Fq 'prediction for current keyframe' web/src/RealtimeDemoTab.jsx
grep -Fq 'current prediction rows' web/src/RealtimeDemoTab.jsx
grep -Fq 'predictionLag' web/src/main.jsx
grep -Fq 'segment.toAnchor.anchor_id === item.anchor_id' web/src/PredictionTab.jsx
grep -Fq 'segmentPlaybackRef.current = { segmentIndex: latestIndex' web/src/main.jsx
grep -Fq 'VISIBLE_ROW_LIMIT = 15' web/src/demoConstants.js
grep -Fq 'DEMO_RECORD_LIMIT = 15' web/src/demoConstants.js
grep -Fq 'PREDICTION_WINDOW_BEFORE = 7' web/src/demoConstants.js
grep -Fq 'PREDICTION_WINDOW_AFTER = 7' web/src/demoConstants.js
grep -Fq 'const demoRecordLimit = 15;' web/vite.config.js
grep -Fq 'tailDemoText(event, data)' web/vite.config.js
grep -Fq 'parseRuntimeAnchorsJsonl(text, DEMO_RECORD_LIMIT)' web/src/main.jsx
grep -Fq 'parsePredictionSegmentsJsonl(text, DEMO_RECORD_LIMIT)' web/src/main.jsx
grep -Fq 'latestPlayableSegmentKeyRef' web/src/main.jsx
grep -Fq 'latestKey !== previousLatestKey' web/src/main.jsx
grep -Fq 'formatPredictionCsvRow(prediction)' web/src/RealtimeDemoTab.jsx
grep -Fq 'formatPredictionCsvRow(prediction)' web/src/PredictionTab.jsx
grep -Fq 'export function RealtimeDemoTab' web/src/RealtimeDemoTab.jsx
grep -Fq 'export function PredictionTab' web/src/PredictionTab.jsx
grep -Fq 'export function AnchorsTab' web/src/AnchorsTab.jsx
grep -Fq 'export function PlaybackToolbar' web/src/PlaybackToolbar.jsx
grep -Fq 'export function MetricsPanels' web/src/MetricsPanels.jsx
grep -Fq 'export function DemoHeader' web/src/DemoHeader.jsx
grep -Fq 'from "./RealtimeDemoTab.jsx"' web/src/main.jsx
grep -Fq 'from "./PredictionTab.jsx"' web/src/main.jsx
grep -Fq 'from "./AnchorsTab.jsx"' web/src/main.jsx
grep -Fq 'from "./PlaybackToolbar.jsx"' web/src/main.jsx
grep -Fq 'from "./MetricsPanels.jsx"' web/src/main.jsx
grep -Fq 'from "./DemoHeader.jsx"' web/src/main.jsx
grep -Fq 'from "./manualPlayback.js"' web/src/main.jsx
grep -Fq 'from "./demoDisplay.js"' web/src/main.jsx
grep -Fq 'from "./playbackTiming.js"' web/src/main.jsx
grep -Fq 'from "./demoTransport.js"' web/src/main.jsx
grep -Fq 'export function anchorFrameAt' web/src/manualPlayback.js
grep -Fq 'export function advanceAnchorPlayback' web/src/manualPlayback.js
grep -Fq 'export function predictionFrameForAnchor' web/src/manualPlayback.js
grep -Fq 'export function currentRuntimeAnchorIndexForDisplay' web/src/demoDisplay.js
grep -Fq 'export function predictionFrameWindow' web/src/demoDisplay.js
grep -Fq 'export function resumePlaybackAtCurrentFrame' web/src/playbackTiming.js
grep -Fq 'export function fetchInitialDemoData' web/src/demoTransport.js
grep -Fq 'export function connectDemoEvents' web/src/demoTransport.js
grep -Fq 'connectDemoEvents({' web/src/main.jsx
grep -Fq 'switchPlaybackMode(tab.mode)' web/src/PlaybackToolbar.jsx
grep -Fq 'anchorFrameAt(keyframes, selectedKeyframeIndex)' web/src/main.jsx
grep -Fq 'advanceAnchorPlayback({' web/src/main.jsx
grep -Fq 'anchorPlaybackRef' web/src/main.jsx
grep -Fq 'keyframesRef.current' web/src/main.jsx
grep -Fq 'sequenceResultRef.current' web/src/main.jsx
grep -Fq '}, [playMode, running, playbackReady]);' web/src/main.jsx
grep -Fq 'pausedFrameIndex / segment.frames.length' web/src/playbackTiming.js
grep -Fq 'if (playMode === PLAY_MODES.ANCHORS) {' web/src/main.jsx
grep -Fq 'setRunning(false);' web/src/main.jsx
if grep -Fq 'setPlayMode(tab.mode); setRunning(true)' web/src/main.jsx; then
    echo "anchors tab switch should not auto-start playback" >&2
    exit 1
fi
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
