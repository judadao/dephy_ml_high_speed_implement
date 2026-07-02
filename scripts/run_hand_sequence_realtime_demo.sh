#!/bin/sh
set -eu

outdir="web/public/demo/hand_sequence"
model="${MODEL:-build_out/hand_sequence/model.json}"
keyframes="${KEYFRAMES:-examples/hand/hand_keyframes.csv}"
interval="${INTERVAL_SEC:-1}"

mkdir -p "$outdir"

if [ ! -f "$model" ]; then
    OUTDIR=build_out sh scripts/test_hand_sequence_model.sh >/dev/null
fi

while :; do
    python3 scripts/dephy_hand_sequence_predict.py \
        --keyframes "$keyframes" \
        --model "$model" \
        --out "$outdir/prediction.csv.tmp" \
        --result "$outdir/result.json.tmp" \
        --render-ms 16
    mv "$outdir/prediction.csv.tmp" "$outdir/prediction.csv"
    mv "$outdir/result.json.tmp" "$outdir/result.json"
    sleep "$interval"
done
