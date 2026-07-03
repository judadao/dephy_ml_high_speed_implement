#!/bin/sh
set -eu

outdir="${OUTDIR:-build_out}/cyclic_io_device_e2e"
simul_repo="${SIMUL_REPO:-../linux_io_device_simul}"
simul_bin="$simul_repo/build_out/linux_io_device_simul"
trigger="$simul_repo/local_trigger_scenarios/twenty_slot_interleaved.trigger"

if [ ! -x "$simul_bin" ]; then
    make -C "$simul_repo" -f Makefile.linux "$simul_bin"
fi

if [ ! -f "$trigger" ]; then
    make -C "$simul_repo" -f Makefile.linux prepare-local-trigger-scenarios
fi

rm -rf "$outdir"
mkdir -p "$outdir"

"$simul_bin" --slot-stream --loop 2 --sample-ms 300 "$trigger" > "$outdir/slot_stream.out"

python3 scripts/cyclic_io_slot_stream_to_dataset.py \
    --stream "$outdir/slot_stream.out" \
    --out "$outdir/dataset"

python3 - "$outdir/dataset/result.json" <<'PY'
import json
import sys
from pathlib import Path

result = json.loads(Path(sys.argv[1]).read_text())
assert result["success"] is True, result
assert result["events"] > 0, result
assert result["vector_frames"] > 0, result
assert result["prediction_frames"] == 1000, result
print("cyclic io-device e2e ok")
PY

test -f "$outdir/dataset/metadata.json"
test -f "$outdir/dataset/snapshots.json"
test -f "$outdir/dataset/positive/clean/raw_events.csv"
test -f "$outdir/dataset/positive/clean/vector_frames.csv"
