#!/bin/sh
set -eu

outdir="web/public/demo/hand_sequence"
model="${MODEL:-build_out/hand_sequence/model.json}"
keyframes="${KEYFRAMES:-examples/hand/hand_keyframes.csv}"
interval="${INTERVAL_SEC:-1}"
frames="${FRAMES:-1000}"
random_init="${RANDOM_INIT:-1}"
keyframe_count="${KEYFRAME_COUNT:-12}"
keyframe_mode="${KEYFRAME_MODE:-grasp_can}"
sample_ms="${SAMPLE_MS:-300}"
noise_scale="${NOISE_SCALE:-1.0}"
seed_base="${SEED:-$(date +%s)}"
loops=0
successes=0

mkdir -p "$outdir"

if [ ! -f "$model" ]; then
    OUTDIR=build_out sh scripts/test_hand_sequence_model.sh >/dev/null
fi

while :; do
    active_keyframes="$keyframes"
    if [ "$random_init" = "1" ]; then
        active_keyframes="$outdir/keyframes.csv.tmp"
        python3 scripts/generate_random_hand_keyframes.py \
            --out "$active_keyframes" \
            --count "$keyframe_count" \
            --sample-ms "$sample_ms" \
            --seed "$((seed_base + loops))" \
            --noise-scale "$noise_scale" \
            --mode "$keyframe_mode"
    fi

    python3 scripts/dephy_hand_sequence_predict.py \
        --keyframes "$active_keyframes" \
        --model "$model" \
        --out "$outdir/prediction.csv.tmp" \
        --result "$outdir/result.json.tmp" \
        --render-ms 16 \
        --frames "$frames"

    loops=$((loops + 1))
    if grep -q '"success": true' "$outdir/result.json.tmp"; then
        successes=$((successes + 1))
    fi
    completion_rate="$(awk -v s="$successes" -v n="$loops" 'BEGIN { if (n == 0) print "0.000000"; else printf "%.6f", s / n }')"
    python3 - "$outdir/result.json.tmp" "$completion_rate" "$loops" "$successes" "$random_init" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
data = json.loads(path.read_text())
data["realtime_random_init"] = sys.argv[5] == "1"
data["completion_trials"] = int(sys.argv[3])
data["completion_successes"] = int(sys.argv[4])
data["completion_rate"] = float(sys.argv[2])
path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")
PY

    if [ "$random_init" = "1" ]; then
        mv "$active_keyframes" "web/public/demo/hand_keyframes.csv"
    fi
    mv "$outdir/prediction.csv.tmp" "$outdir/prediction.csv"
    mv "$outdir/result.json.tmp" "$outdir/result.json"
    sleep "$interval"
done
