#!/bin/sh
set -eu

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
io_repo="${repo_root}/../linux_io_device_simul"
out_dir="${OUTDIR:-build_out}/io_device_realtime_hand"
model_dir="${OUTDIR:-build_out}/hand_sequence"

if [ ! -d "$io_repo" ]; then
    echo "linux_io_device_simul sibling repo not found; skipping realtime hand e2e"
    exit 0
fi

mkdir -p "$out_dir"
make -C "$io_repo" -f Makefile.linux >/dev/null

if [ ! -f "$model_dir/model.json" ]; then
    OUTDIR="${OUTDIR:-build_out}" sh scripts/test_hand_sequence_model.sh >/dev/null
fi

SIMUL_BIN="$io_repo/build_out/linux_io_device_simul" OUTDIR="${OUTDIR:-build_out}" SAMPLE_MS=300 LOOP=1 RUNTIME_IO="$out_dir/runtime_io.csv" RUNTIME_ANCHORS="$out_dir/runtime_anchors.jsonl" \
    sh scripts/run_io_device_realtime_bridge.sh \
    "$io_repo/scripts/hand_keyframe_demo.script" \
    "$out_dir/sample_keyframes.csv"

keyframe_count="$(($(wc -l < "$out_dir/sample_keyframes.csv") - 1))"
test "$keyframe_count" -ge 2
test -s "$out_dir/runtime_io.csv"
test -s "$out_dir/runtime_anchors.jsonl"

python3 scripts/dephy_hand_realtime_watcher.py \
    --anchors "$out_dir/runtime_anchors.jsonl" \
    --model "$model_dir/model.json" \
    --out "$out_dir/prediction_segments.jsonl" \
    --result "$out_dir/result.json" \
    --sample-ms 300 \
    --frames 100 \
    --max-keyframes "$keyframe_count" \
    --bootstrap-samples "$out_dir/bootstrap_samples.jsonl" \
    --truncate

grep -q '"segment_type":"bootstrap"' "$out_dir/prediction_segments.jsonl"
grep -q '"segment_type":"confirmed"' "$out_dir/prediction_segments.jsonl"
grep -q '"from_anchor"' "$out_dir/prediction_segments.jsonl"
grep -q '"format": "dephy_realtime_prediction_result_v1"' "$out_dir/result.json"
grep -q '"success": true' "$out_dir/result.json"
python3 - "$out_dir/result.json" "$keyframe_count" <<'PY'
import json
import sys
result = json.load(open(sys.argv[1]))
keyframes = int(sys.argv[2])
assert result["keyframes_seen"] == keyframes, result
assert result["anchors_seen"] == keyframes, result
assert result["confirmed_segments"] == keyframes - 1, result
assert result["prediction_frames"] > keyframes * 50, result
PY
