#!/usr/bin/env python3
"""Append runtime IO and runtime anchors in a loop to simulate device output."""

from __future__ import annotations

import argparse
import csv
import json
import random
import time
from pathlib import Path

from runtime_io_to_anchor import row_to_anchor


FIELDS = ["x", "y", "z", "yaw", "pitch", "roll", "grip"]
HEADER = ["io_id", "t_ms", "slot", "io_type", "channel", "value", "x", "y", "z", "yaw", "pitch", "roll", "grip", "confidence", "jitter", "source"]


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def make_runtime_row(sample: dict, index: int, t_ms: int, rng: random.Random, noise_scale: float, source: str) -> list:
    pose = {
        "x": float(sample["x"]) + rng.uniform(-0.018, 0.018) * noise_scale,
        "y": float(sample["y"]) + rng.uniform(-0.014, 0.014) * noise_scale,
        "z": float(sample["z"]) + rng.uniform(-0.01, 0.01) * noise_scale,
        "yaw": float(sample["yaw"]) + rng.uniform(-0.026, 0.026) * noise_scale,
        "pitch": float(sample["pitch"]) + rng.uniform(-0.02, 0.02) * noise_scale,
        "roll": float(sample["roll"]) + rng.uniform(-0.02, 0.02) * noise_scale,
        "grip": clamp(float(sample["grip"]) + rng.uniform(-0.06, 0.06) * noise_scale, 0.0, 1.0),
    }
    jitter = sum(abs(pose[field] - float(sample[field])) for field in FIELDS) / len(FIELDS)
    return [
        f"runtime_io_{index:06d}",
        t_ms,
        1 + (index % 20),
        "ai",
        1 + (index % 8),
        round(pose["grip"] * 100.0, 3),
        *(pose[field] for field in FIELDS),
        round(max(0.35, 1.0 - jitter * 8.0), 6),
        round(jitter, 6),
        source,
    ]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample-keyframes", required=True)
    parser.add_argument("--runtime-io", required=True)
    parser.add_argument("--runtime-anchors", required=True)
    parser.add_argument("--sample-ms", type=int, default=300)
    parser.add_argument("--loop", type=int, default=1, help="0 means infinite loop")
    parser.add_argument("--seed", type=int, default=303)
    parser.add_argument("--noise-scale", type=float, default=1.0)
    parser.add_argument("--source", default="loop_runtime_io")
    parser.add_argument("--no-sleep", action="store_true")
    args = parser.parse_args()

    with Path(args.sample_keyframes).open(newline="") as fp:
        samples = list(csv.DictReader(fp))
    if not samples:
        raise ValueError("sample keyframes are empty")

    runtime_io = Path(args.runtime_io)
    runtime_anchors = Path(args.runtime_anchors)
    runtime_io.parent.mkdir(parents=True, exist_ok=True)
    runtime_anchors.parent.mkdir(parents=True, exist_ok=True)
    rng = random.Random(args.seed)

    with runtime_io.open("w", newline="") as io_fp, runtime_anchors.open("w") as anchor_fp:
      writer = csv.writer(io_fp)
      writer.writerow(HEADER)
      io_fp.flush()
      index = 0
      loop_index = 0
      while args.loop == 0 or loop_index < args.loop:
          for sample in samples:
              row = make_runtime_row(sample, index, index * args.sample_ms, rng, args.noise_scale, args.source)
              writer.writerow(row)
              io_fp.flush()
              anchor = row_to_anchor(dict(zip(HEADER, row)), index)
              anchor_fp.write(json.dumps(anchor, separators=(",", ":"), sort_keys=True) + "\n")
              anchor_fp.flush()
              index += 1
              if not args.no_sleep:
                  time.sleep(args.sample_ms / 1000)
          loop_index += 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
