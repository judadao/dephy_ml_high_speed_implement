#!/bin/sh
set -eu

outdir="${OUTDIR:-build_out}/bootstrap_prior"
model_dir="${OUTDIR:-build_out}/hand_sequence"
mkdir -p "$outdir"

if [ ! -f "$model_dir/model.json" ]; then
    OUTDIR="${OUTDIR:-build_out}" sh scripts/test_hand_sequence_model.sh >/dev/null
fi

cat > "$outdir/samples.jsonl" <<'JSONL'
{"format":"dephy_bootstrap_prior_sample_v1","label":"positive","start":[0,0,0,0,0,0,0.1],"predicted_target":[0,0.006,0,0,0,0,0.18],"actual_target":[0,0.02,0,0,0,0,0.3],"sample_ms":300,"metrics":{"target_error":0.01}}
{"format":"dephy_bootstrap_prior_sample_v1","label":"positive","start":[0,0,0,0,0,0,0.2],"predicted_target":[0,0.006,0,0,0,0,0.28],"actual_target":[0,0.03,0,0,0,0,0.4],"sample_ms":300,"metrics":{"target_error":0.01}}
JSONL

python3 scripts/train_bootstrap_prior.py \
    --samples "$outdir/samples.jsonl" \
    --model-in "$model_dir/model.json" \
    --model-out "$outdir/model_with_prior.json" > "$outdir/prior_metrics.json"

grep -q '"format": "dephy_bootstrap_prior_v2"' "$outdir/model_with_prior.json"
grep -q '"bootstrap_prior"' "$outdir/model_with_prior.json"
grep -q '"samples": 2' "$outdir/model_with_prior.json"
grep -q '"std_delta"' "$outdir/model_with_prior.json"
grep -q '"confidence_by_axis"' "$outdir/model_with_prior.json"
grep -q '"mean_delta"' "$outdir/model_with_prior.json"
