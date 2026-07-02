#!/bin/sh
set -eu

out="${OUTDIR:-build_out}/hand_policy.json"
python3 scripts/train_hand_policy.py \
    --scenario scenarios/hand/straight_move.csv \
    --scenario scenarios/hand/grip_close.csv \
    --scenario scenarios/hand/turn_and_move.csv \
    --out "$out" \
    --iterations 20 \
    --seed 11 > "${OUTDIR:-build_out}/hand_policy_metrics.json"

test -f "$out"
grep -q '"format": "dephy_hand_policy_v1"' "$out"
grep -q '"success_rate"' "${OUTDIR:-build_out}/hand_policy_metrics.json"
