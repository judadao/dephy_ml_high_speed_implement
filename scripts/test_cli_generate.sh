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

matrix_out="${OUTDIR:-build_out}/test_matrix_frames"
rm -rf "$matrix_out"
"${OUTDIR:-build_out}/dephy_bitmap_anim" --out "$matrix_out" --frames 3 --width 32 --height 24 --format indexed
test -f "$matrix_out/frame_0000.pgm"
grep -q "format=indexed" "$matrix_out/manifest.txt"
head -c 2 "$matrix_out/frame_0000.pgm" | grep -q "P5"

"${OUTDIR:-build_out}/dephy_bitmap_anim" --width 32 --height 24 --benchmark 12 | grep -q "fps="

raw_out="${OUTDIR:-build_out}/test_raw_frames"
rm -rf "$raw_out"
"${OUTDIR:-build_out}/dephy_bitmap_anim" --out "$raw_out" --frames 2 --width 16 --height 12 --format raw
test -f "$raw_out/frame_0000.raw"
test "$(wc -c < "$raw_out/frame_0000.raw")" -eq 576
grep -q "format=raw" "$raw_out/manifest.txt"
