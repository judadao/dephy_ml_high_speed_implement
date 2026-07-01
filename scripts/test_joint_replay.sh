#!/bin/sh
set -eu

out="${OUTDIR:-build_out}/joint_replay.csv"
"${OUTDIR:-build_out}/dephy_joint_replay" --render-ms 16 --io-ms 300 --samples 3 --turn-left > "$out"

grep -q '^frame_t_ms,joint,confidence,rx,ry,rz,px,py,pz' "$out"
grep -q ',left_knee,' "$out"
grep -q ',right_ankle,' "$out"
grep -q '^300,root,' "$out"

lines="$(wc -l < "$out")"
test "$lines" -gt 600

event_out="${OUTDIR:-build_out}/joint_replay_event.csv"
"${OUTDIR:-build_out}/dephy_joint_replay" --samples 2 --event 1:ai:1:80 --event 2:di:3:1 > "$event_out"
grep -q ',right_knee,' "$event_out"
grep -q '^300,root,' "$event_out"
