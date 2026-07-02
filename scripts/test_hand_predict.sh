#!/bin/sh
set -eu

out="${OUTDIR:-build_out}/hand_straight.csv"
"${OUTDIR:-build_out}/dephy_hand_predict" \
    --keyframes scenarios/hand/straight_move.csv \
    --render-ms 16 > "$out"

grep -q '^frame_t_ms,target_frame,palm_x,palm_y,palm_z' "$out"
grep -q ',reach,' "$out"
tail -n 1 "$out" | awk -F, '{ if ($15 != "1") exit 1; if ($13 > 0.02) exit 1; }'

grip_out="${OUTDIR:-build_out}/hand_grip.csv"
"${OUTDIR:-build_out}/dephy_hand_predict" \
    --keyframes scenarios/hand/grip_close.csv \
    --render-ms 16 > "$grip_out"
tail -n 1 "$grip_out" | awk -F, '{ if ($9 < 0.98) exit 1; }'

hold_out="${OUTDIR:-build_out}/hand_hold.csv"
"${OUTDIR:-build_out}/dephy_hand_predict" \
    --keyframes scenarios/hand/safety_hold.csv \
    --render-ms 16 > "$hold_out"
tail -n 1 "$hold_out" | awk -F, '{ if ($3 != "0.00000") exit 1; if ($14 != "1.000") exit 1; }'
