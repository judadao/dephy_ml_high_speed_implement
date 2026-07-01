#!/bin/sh
set -eu

if ! command -v google-chrome >/dev/null 2>&1; then
    echo "google-chrome not found; skipping web render check"
    exit 0
fi

out_dir="${OUTDIR:-build_out}/web-render"
mkdir -p "$out_dir"

google-chrome \
    --headless \
    --disable-gpu \
    --no-sandbox \
    --use-gl=swiftshader \
    --enable-unsafe-swiftshader \
    --screenshot="$out_dir/page.png" \
    --window-size=1440,1000 \
    --virtual-time-budget=3000 \
    http://127.0.0.1:8091/ >/dev/null 2>"$out_dir/chrome.err"

if grep -q "Uncaught\\|ReferenceError\\|TypeError" "$out_dir/chrome.err"; then
    cat "$out_dir/chrome.err" >&2
    exit 1
fi

bytes="$(wc -c < "$out_dir/page.png")"
if [ "$bytes" -lt 30000 ]; then
    echo "web screenshot looks blank: $bytes bytes" >&2
    exit 1
fi
