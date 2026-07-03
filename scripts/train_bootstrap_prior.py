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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", required=True)
    parser.add_argument("--model-in", required=True)
    parser.add_argument("--model-out", required=True)
    parser.add_argument("--max-positive-error", type=float, default=0.02)
    args = parser.parse_args()

    rows = load_jsonl(Path(args.samples))
    model = json.loads(Path(args.model_in).read_text())
    usable = [
        row
        for row in rows
        if row.get("format") == "dephy_bootstrap_prior_sample_v1"
        and float(row.get("metrics", {}).get("target_error", 1.0)) <= args.max_positive_error
    ]
    if not usable:
        usable = [row for row in rows if row.get("format") == "dephy_bootstrap_prior_sample_v1"]

    deltas = []
    errors = []
    for row in usable:
        start = row["start"]
        actual = row["actual_target"]
        deltas.append([float(actual[index]) - float(start[index]) for index in range(7)])
        errors.append(float(row.get("metrics", {}).get("target_error", 1.0)))

    mean_delta = [mean([delta[index] for delta in deltas]) for index in range(7)] if deltas else [0.0, 0.006, 0.0, 0.0, 0.0, 0.0, 0.08]
    avg_error = mean(errors) if errors else 1.0
    model["bootstrap_prior"] = {
        "format": "dephy_bootstrap_prior_v1",
        "samples": len(usable),
        "mean_delta": mean_delta,
        "avg_target_error": avg_error,
        "confidence": max(0.15, min(0.95, 1.0 - avg_error * 8.0)),
    }
    Path(args.model_out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.model_out).write_text(json.dumps(model, indent=2, sort_keys=True) + "\n")
    print(json.dumps(model["bootstrap_prior"], sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
