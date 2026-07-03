#!/usr/bin/env python3
"""Generate noisy runtime IO observations from reference/sample hand keyframes."""

from __future__ import annotations

import argparse
import csv
import random
from pathlib import Path


FIELDS = ["x", "y", "z", "yaw", "pitch", "roll", "grip"]


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample-keyframes", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--seed", type=int, default=101)
    parser.add_argument("--noise-scale", type=float, default=1.0)
    parser.add_argument("--source", default="simulated_runtime_io")
    args = parser.parse_args()

    rng = random.Random(args.seed)
    with Path(args.sample_keyframes).open(newline="") as fp:
        rows = list(csv.DictReader(fp))

    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    with Path(args.out).open("w", newline="") as fp:
        writer = csv.writer(fp)
        writer.writerow(["io_id", "t_ms", "slot", "io_type", "channel", "value", "x", "y", "z", "yaw", "pitch", "roll", "grip", "confidence", "jitter", "source"])
        for index, row in enumerate(rows):
            noise = args.noise_scale
            pose = {
                "x": float(row["x"]) + rng.uniform(-0.018, 0.018) * noise,
                "y": float(row["y"]) + rng.uniform(-0.014, 0.014) * noise,
                "z": float(row["z"]) + rng.uniform(-0.01, 0.01) * noise,
                "yaw": float(row["yaw"]) + rng.uniform(-0.026, 0.026) * noise,
                "pitch": float(row["pitch"]) + rng.uniform(-0.02, 0.02) * noise,
                "roll": float(row["roll"]) + rng.uniform(-0.02, 0.02) * noise,
                "grip": clamp(float(row["grip"]) + rng.uniform(-0.06, 0.06) * noise, 0.0, 1.0),
            }
            jitter = sum(abs(pose[field] - float(row[field])) for field in FIELDS) / len(FIELDS)
            writer.writerow(
                [
                    f"runtime_io_{index:04d}",
                    int(float(row["t_ms"])),
                    1 + (index % 20),
                    "ai",
                    1 + (index % 8),
                    round(pose["grip"] * 100.0, 3),
                    *(pose[field] for field in FIELDS),
                    round(max(0.35, 1.0 - jitter * 8.0), 6),
                    round(jitter, 6),
                    args.source,
                ]
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
