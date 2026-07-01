#!/bin/sh
set -eu

out="${OUTDIR:-build_out}/test_frames"
rm -rf "$out"
"${OUTDIR:-build_out}/dephy_bitmap_anim" --out "$out" --frames 6 --width 96 --height 72 --cycles 1

test -f "$out/manifest.txt"
test -f "$out/frame_0000.ppm"
test -f "$out/frame_0005.ppm"
grep -q "frames=6" "$out/manifest.txt"
head -c 2 "$out/frame_0000.ppm" | grep -q "P6"

