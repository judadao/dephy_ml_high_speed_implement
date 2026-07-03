#!/bin/sh
set -eu

outdir="${OUTDIR:-build_out}/runtime"
anchors="${RUNTIME_ANCHORS:-web/public/demo/runtime_anchors.jsonl}"
segments="${SEGMENTS:-web/public/demo/hand_sequence/prediction_segments.jsonl}"
result="${RESULT:-web/public/demo/hand_sequence/result.json}"
model="${MODEL:-build_out/hand_sequence/model.json}"
samples="${BOOTSTRAP_SAMPLES:-$outdir/bootstrap_samples.jsonl}"
frames="${FRAMES:-1000}"
sample_ms="${SAMPLE_MS:-300}"
poll_ms="${POLL_MS:-100}"
restart="${RESTART:-1}"
log="$outdir/realtime_watcher.log"

mkdir -p "$outdir" "$(dirname "$segments")" "$(dirname "$result")"

if [ ! -f "$model" ]; then
    OUTDIR="${OUTDIR:-build_out}" sh scripts/test_hand_sequence_model.sh >/dev/null
fi

while :; do
    {
        printf '[%s] starting realtime watcher\n' "$(date -Is)"
        python3 scripts/dephy_hand_realtime_watcher.py \
            --anchors "$anchors" \
            --model "$model" \
            --out "$segments" \
            --result "$result" \
            --sample-ms "$sample_ms" \
            --frames "$frames" \
            --poll-ms "$poll_ms" \
            --bootstrap-samples "$samples" \
            --resume
        printf '[%s] watcher exited cleanly\n' "$(date -Is)"
    } >> "$log" 2>&1
    [ "$restart" = "1" ] || break
    sleep 1
done
