#!/bin/sh
set -eu

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
io_repo="${repo_root}/../linux_io_device_simul"
out_dir="${OUTDIR:-build_out}"
stream="${out_dir}/io_device_motion_stream.out"
joints="${out_dir}/io_device_motion_joints.csv"

if [ ! -d "$io_repo" ]; then
    echo "linux_io_device_simul sibling repo not found; skipping io-device pipeline check"
    exit 0
fi

make -C "$io_repo" -f Makefile.linux >/dev/null

"$io_repo/build_out/linux_io_device_simul" \
    --slot-stream \
    --loop 2 \
    --sample-ms 300 \
    "$io_repo/scripts/motion_pipeline.trigger" > "$stream"

"${out_dir}/dephy_joint_replay" --from-io-stream "$stream" > "$joints"

grep -q '^frame_t_ms,joint,confidence,rx,ry,rz,px,py,pz' "$joints"
grep -q ',left_thumb_1,' "$joints"
grep -q ',right_toe,' "$joints"
grep -q ',left_forearm_twist,' "$joints"

lines="$(wc -l < "$joints")"
test "$lines" -gt 3000
