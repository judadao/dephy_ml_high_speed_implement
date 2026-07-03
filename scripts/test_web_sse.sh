#!/bin/sh
set -eu

if ! command -v curl >/dev/null 2>&1; then
    echo "curl not found; skipping web SSE check"
    exit 0
fi

port="${WEB_PORT:-8092}"
outdir="${OUTDIR:-build_out}/web-sse"
mkdir -p "$outdir"

npm --prefix web run dev -- --host 127.0.0.1 --port "$port" > "$outdir/vite.log" 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT

for _ in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS "http://127.0.0.1:$port/" >/dev/null 2>&1; then
        break
    fi
    sleep 0.5
done

timeout 8s curl -fsS -N "http://127.0.0.1:$port/demo/events" > "$outdir/events.out" || true

grep -q '^event: ready' "$outdir/events.out"
grep -q '^event: sample_keyframes' "$outdir/events.out"
grep -q '^event: runtime_anchors' "$outdir/events.out"
grep -q '^event: policy' "$outdir/events.out"
grep -q '^event: prediction_segments' "$outdir/events.out"
grep -q '^event: result' "$outdir/events.out"
