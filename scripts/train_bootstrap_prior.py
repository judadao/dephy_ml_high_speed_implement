#!/usr/bin/env python3
"""Fine-tune a lightweight bootstrap prior from realtime bootstrap samples."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def load_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open() as fp:
        return [json.loads(line) for line in fp if line.strip()]


def mean(values: list[float]) -> float:
    return sum(values) / max(len(values), 1)


def stddev(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    avg = mean(values)
    return (sum((value - avg) ** 2 for value in values) / (len(values) - 1)) ** 0.5


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 1.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, int(round((len(ordered) - 1) * pct))))
    return ordered[index]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", required=True)
    parser.add_argument("--model-in", required=True)
    parser.add_argument("--model-out", required=True)
    parser.add_argument("--max-positive-error", type=float, default=0.02)
    args = parser.parse_args()

    rows = load_jsonl(Path(args.samples))
    model = json.loads(Path(args.model_in).read_text())
    all_samples = [row for row in rows if row.get("format") == "dephy_bootstrap_prior_sample_v1"]
    positives = [
        row
        for row in rows
        if row.get("format") == "dephy_bootstrap_prior_sample_v1"
        and float(row.get("metrics", {}).get("target_error", 1.0)) <= args.max_positive_error
    ]
    negatives = [row for row in all_samples if row not in positives]
    usable = positives or all_samples

    deltas = []
    errors = []
    for row in usable:
        start = row["start"]
        actual = row["actual_target"]
        deltas.append([float(actual[index]) - float(start[index]) for index in range(7)])
        errors.append(float(row.get("metrics", {}).get("target_error", 1.0)))

    mean_delta = [mean([delta[index] for delta in deltas]) for index in range(7)] if deltas else [0.0, 0.006, 0.0, 0.0, 0.0, 0.0, 0.08]
    std_delta = [stddev([delta[index] for delta in deltas]) for index in range(7)] if deltas else [0.0] * 7
    avg_error = mean(errors) if errors else 1.0
    p95_error = percentile(errors, 0.95)
    confidence_by_axis = [max(0.1, min(0.98, 1.0 - value * 8.0 - avg_error * 2.0)) for value in std_delta]
    model["bootstrap_prior"] = {
        "format": "dephy_bootstrap_prior_v2",
        "samples": len(usable),
        "positive_samples": len(positives),
        "negative_samples": len(negatives),
        "mean_delta": mean_delta,
        "std_delta": std_delta,
        "avg_target_error": avg_error,
        "p95_target_error": p95_error,
        "confidence": max(0.15, min(0.95, 1.0 - avg_error * 8.0 - mean(std_delta) * 2.0)),
        "confidence_by_axis": confidence_by_axis,
        "selection": "positive_below_threshold" if positives else "all_samples_fallback",
    }
    Path(args.model_out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.model_out).write_text(json.dumps(model, indent=2, sort_keys=True) + "\n")
    print(json.dumps(model["bootstrap_prior"], sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
