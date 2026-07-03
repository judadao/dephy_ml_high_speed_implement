#!/bin/sh
set -eu

outdir="${OUTDIR:-build_out}/cyclic_io_test"
rm -rf "$outdir"
mkdir -p "$outdir"

python3 scripts/generate_cyclic_io_dataset.py --out "$outdir" --count 2 --seed 4242
python3 scripts/validate_cyclic_io_dataset.py \
    --root "$outdir/cyclic_io_synthetic_v1" \
    --result "$outdir/result.json"

python3 - "$outdir/result.json" <<'PY'
import json
import sys
from pathlib import Path

result = json.loads(Path(sys.argv[1]).read_text())
assert result["success"] is True, result
assert result["cases"] == 3, result
for item in result["results"]:
    assert item["prediction_frame_count"] == 1000, item
    assert item["final_snapshot_error"] <= 0.001, item
    assert item["inference_latency_p95_ms"] < 10.0, item
    assert item["few_shot_format"] == "cyclic_io_few_shot_manifest_v1", item
    assert item["training_target_count"] == 7, item
    assert abs(item["detected_cycle_period_ms"] - 500.0) < 1e-6, item
    assert item["nearest_snapshot_checks"] > 0, item
print("cyclic io check ok")
PY

test -f "$outdir/cyclic_io_synthetic_v1/case_a_sine_relay/metadata.json"
test -f "$outdir/cyclic_io_synthetic_v1/case_a_sine_relay/few_shot_manifest.json"
test -f "$outdir/cyclic_io_synthetic_v1/case_a_sine_relay/training_targets.json"
test -f "$outdir/cyclic_io_synthetic_v1/case_a_sine_relay/positive/clean/raw_events.csv"
test -f "$outdir/cyclic_io_synthetic_v1/case_a_sine_relay/negative/impossible_io/vector_frames.csv"
