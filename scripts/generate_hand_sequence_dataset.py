#!/usr/bin/env python3
"""Generate positive and negative single-palm sequence datasets."""

from __future__ import annotations

import argparse
import json
import math
import random
from pathlib import Path


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def smoothstep(t: float) -> float:
    return t * t * (3.0 - 2.0 * t)


def rand_pose(rng: random.Random) -> list[float]:
    return [
        rng.uniform(-0.25, 0.25),
        rng.uniform(-0.12, 0.12),
        rng.uniform(-0.06, 0.06),
        rng.uniform(-0.35, 0.35),
        rng.uniform(-0.18, 0.18),
        rng.uniform(-0.18, 0.18),
        rng.uniform(0.0, 1.0),
    ]


def make_positive(rng: random.Random, sample_ms: int, render_ms: int) -> dict:
    start = rand_pose(rng)
    target = rand_pose(rng)
    steps = max(2, sample_ms // render_ms)
    frames = []
    prev = start
    max_jump = 0.0
    for index in range(steps + 1):
        t = smoothstep(index / steps)
        pose = [lerp(start[i], target[i], t) for i in range(7)]
        jump = max(abs(pose[i] - prev[i]) for i in range(7))
        max_jump = max(max_jump, jump)
        frames.append({"t_ms": index * render_ms, "pose": pose})
        prev = pose
    return {
        "label": "positive",
        "start": start,
        "target": target,
        "sample_ms": sample_ms,
        "render_ms": render_ms,
        "frames": frames,
        "metrics": {"max_jump": max_jump, "final_error": 0.0},
    }


def make_negative(rng: random.Random, sample_ms: int, render_ms: int) -> dict:
    start = rand_pose(rng)
    target = rand_pose(rng)
    steps = max(2, sample_ms // render_ms)
    mode = rng.choice(["snap", "overshoot", "jitter"])
    frames = []
    prev = start
    max_jump = 0.0
    final_pose = target
    for index in range(steps + 1):
        t = index / steps
        if mode == "snap":
            pose = start[:] if t < 0.75 else target[:]
        elif mode == "overshoot":
            overshoot = 1.35 + 0.25 * math.sin(t * math.pi)
            pose = [start[i] + (target[i] - start[i]) * min(overshoot * t, overshoot) for i in range(7)]
        else:
            pose = [lerp(start[i], target[i], t) + rng.uniform(-0.08, 0.08) for i in range(7)]
            pose[6] = max(0.0, min(1.0, pose[6]))
        jump = max(abs(pose[i] - prev[i]) for i in range(7))
        max_jump = max(max_jump, jump)
        frames.append({"t_ms": index * render_ms, "pose": pose})
        prev = pose
        final_pose = pose
    final_error = sum(abs(final_pose[i] - target[i]) for i in range(7)) / 7.0
    return {
        "label": "negative",
        "start": start,
        "target": target,
        "sample_ms": sample_ms,
        "render_ms": render_ms,
        "frames": frames,
        "metrics": {"max_jump": max_jump, "final_error": final_error, "mode": mode},
    }


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as fp:
        for row in rows:
            fp.write(json.dumps(row, separators=(",", ":")) + "\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--positive-out", required=True)
    parser.add_argument("--negative-out", required=True)
    parser.add_argument("--count", type=int, default=120)
    parser.add_argument("--sample-ms", type=int, default=300)
    parser.add_argument("--render-ms", type=int, default=16)
    parser.add_argument("--seed", type=int, default=17)
    args = parser.parse_args()

    rng = random.Random(args.seed)
    positives = [make_positive(rng, args.sample_ms, args.render_ms) for _ in range(args.count)]
    negatives = [make_negative(rng, args.sample_ms, args.render_ms) for _ in range(args.count)]
    write_jsonl(Path(args.positive_out), positives)
    write_jsonl(Path(args.negative_out), negatives)
    print(json.dumps({"positive": len(positives), "negative": len(negatives), "seed": args.seed}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
