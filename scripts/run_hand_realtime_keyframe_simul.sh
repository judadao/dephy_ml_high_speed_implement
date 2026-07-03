#!/bin/sh
set -eu

out="${1:-web/public/demo/hand_keyframes.csv}"
count="${KEYFRAME_COUNT:-16}"
sample_ms="${SAMPLE_MS:-300}"
seed="${WEB_SEED:-101}"
noise_scale="${NOISE_SCALE:-1.0}"
mode="${KEYFRAME_MODE:-grasp_can}"
loop="${LOOP:-1}"
tmp="${OUTDIR:-build_out}/runtime/keyframes_source.csv"

mkdir -p "$(dirname "$out")" "$(dirname "$tmp")"
python3 scripts/generate_random_hand_keyframes.py \
    --out "$tmp" \
    --count "$count" \
    --sample-ms "$sample_ms" \
    --seed "$seed" \
    --noise-scale "$noise_scale" \
    --mode "$mode"

header="$(head -n 1 "$tmp")"
printf '%s\n' "$header" > "$out"

iteration=0
while [ "$loop" = "0" ] || [ "$iteration" -lt "$loop" ]; do
    tail -n +2 "$tmp" | while IFS= read -r row; do
        printf '%s\n' "$row" >> "$out"
        sleep "$(awk "BEGIN { printf \"%.3f\", $sample_ms / 1000 }")"
    done
    iteration=$((iteration + 1))
done
