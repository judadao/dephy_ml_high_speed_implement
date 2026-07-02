#!/usr/bin/env python3
"""Train a small sequence model with dependency-free policy search."""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def smootherstep(t: float) -> float:
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)


def load_jsonl(path: Path) -> list[dict]:
    with path.open() as fp:
        return [json.loads(line) for line in fp if line.strip()]


def pose_error(a: list[float], b: list[float]) -> float:
    return sum(abs(a[i] - b[i]) for i in range(7)) / 7.0


def max_frame_jump(frames: list[list[float]]) -> float:
    max_jump = 0.0
    for prev, cur in zip(frames, frames[1:]):
        max_jump = max(max_jump, max(abs(cur[i] - prev[i]) for i in range(7)))
    return max_jump


def rollout(model: dict[str, float], start: list[float], target: list[float], sample_ms: int, render_ms: int) -> list[list[float]]:
    steps = max(1, sample_ms // render_ms)
    alpha = model["target_alpha"]
    curve = clamp(1.0 + (0.25 - alpha) * 0.8, 0.75, 1.25)
    frames = []
    for index in range(steps + 1):
        t = index / steps
        s = smootherstep(t) ** curve
        frames.append([start[i] + (target[i] - start[i]) * s for i in range(7)])
    frames[-1] = target[:]
    return frames


def split_jump_metrics(frames: list[list[float]]) -> tuple[float, float, float]:
    pos_jump = 0.0
    rot_jump = 0.0
    grip_jump = 0.0
    for prev, cur in zip(frames, frames[1:]):
        pos_jump = max(pos_jump, max(abs(cur[i] - prev[i]) for i in range(3)))
        rot_jump = max(rot_jump, max(abs(cur[i] - prev[i]) for i in range(3, 6)))
        grip_jump = max(grip_jump, abs(cur[6] - prev[6]))
    return pos_jump, rot_jump, grip_jump


def category_delta(start: list[float], target: list[float]) -> tuple[float, float, float]:
    pos_delta = max(abs(target[i] - start[i]) for i in range(3))
    rot_delta = max(abs(target[i] - start[i]) for i in range(3, 6))
    grip_delta = abs(target[6] - start[6])
    return pos_delta, rot_delta, grip_delta


def score_model(model: dict[str, float], positives: list[dict], negatives: list[dict]) -> dict[str, float]:
    total = 0.0
    successes = 0
    positive_loss = 0.0
    negative_margin_hits = 0
    runs = 0
    for row in positives:
        frames = rollout(model, row["start"], row["target"], row["sample_ms"], row["render_ms"])
        final_error = pose_error(frames[-1], row["target"])
        pos_jump, rot_jump, grip_jump = split_jump_metrics(frames)
        pos_delta, rot_delta, grip_delta = category_delta(row["start"], row["target"])
        pos_limit = max(0.03, pos_delta * 0.16)
        rot_limit = max(0.08, rot_delta * 0.16)
        grip_limit = max(0.08, grip_delta * 0.16)
        loss = (
            final_error * 100.0
            + max(0.0, pos_jump - pos_limit) * 60.0
            + max(0.0, rot_jump - rot_limit) * 20.0
            + max(0.0, grip_jump - grip_limit) * 20.0
        )
        total -= loss
        positive_loss += loss
        successes += 1 if final_error <= 0.000001 and pos_jump <= pos_limit and rot_jump <= rot_limit and grip_jump <= grip_limit else 0
        runs += 1
    for row in negatives:
        jump = float(row["metrics"]["max_jump"])
        final_error = float(row["metrics"]["final_error"])
        badness = jump + final_error
        if badness > 0.04:
            negative_margin_hits += 1
            total += 0.05
        else:
            total -= 0.2
    return {
        "reward": total,
        "success_rate": successes / max(len(positives), 1),
        "positive_loss": positive_loss / max(len(positives), 1),
        "negative_margin_rate": negative_margin_hits / max(len(negatives), 1),
        "runs": runs,
    }


def mutate(model: dict[str, float], rng: random.Random, scale: float) -> dict[str, float]:
    bounds = {
        "kp": (12.0, 80.0),
        "kd": (1.0, 18.0),
        "target_alpha": (0.04, 0.6),
        "max_acc": (1.0, 30.0),
        "max_jerk": (5.0, 240.0),
    }
    next_model = dict(model)
    for key, (low, high) in bounds.items():
        span = high - low
        next_model[key] = clamp(next_model[key] + rng.uniform(-span, span) * scale, low, high)
    return next_model


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--positive", required=True)
    parser.add_argument("--negative", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--iterations", type=int, default=160)
    parser.add_argument("--seed", type=int, default=23)
    args = parser.parse_args()

    positives = load_jsonl(Path(args.positive))
    negatives = load_jsonl(Path(args.negative))
    rng = random.Random(args.seed)
    best = {
        "kp": 34.0,
        "kd": 6.0,
        "target_alpha": 0.22,
        "max_acc": 16.0,
        "max_jerk": 80.0,
    }
    best_metrics = score_model(best, positives, negatives)
    for iteration in range(args.iterations):
        scale = max(0.015, 0.24 * (1.0 - iteration / max(args.iterations, 1)))
        candidate = mutate(best, rng, scale)
        metrics = score_model(candidate, positives, negatives)
        if metrics["reward"] > best_metrics["reward"]:
            best = candidate
            best_metrics = metrics

    artifact = {
        "format": "dephy_hand_sequence_model_v1",
        **best,
        "training": {
            "algorithm": "dependency_free_reward_search",
            "seed": args.seed,
            "iterations": args.iterations,
            "positive": str(args.positive),
            "negative": str(args.negative),
            "metrics": best_metrics,
        },
    }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(artifact, indent=2, sort_keys=True) + "\n")
    print(json.dumps(best_metrics, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
