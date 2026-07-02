#!/usr/bin/env python3
"""Generate random single-palm keyframes for realtime completion testing."""

from __future__ import annotations

import argparse
import csv
import random
from pathlib import Path

from generate_hand_sequence_dataset import rand_pose


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def load_template(path: Path) -> list[dict]:
    with path.open(newline="") as fp:
        return list(csv.DictReader(fp))


def noisy_pose(pose: list[float], rng: random.Random, noise_scale: float) -> list[float]:
    if noise_scale <= 0:
        return pose
    noisy = [
        pose[0] + rng.uniform(-0.025, 0.025) * noise_scale,
        pose[1] + rng.uniform(-0.018, 0.018) * noise_scale,
        pose[2] + rng.uniform(-0.012, 0.012) * noise_scale,
        pose[3] + rng.uniform(-0.035, 0.035) * noise_scale,
        pose[4] + rng.uniform(-0.025, 0.025) * noise_scale,
        pose[5] + rng.uniform(-0.025, 0.025) * noise_scale,
        clamp(pose[6] + rng.uniform(-0.08, 0.08) * noise_scale, 0.0, 1.0),
    ]
    return noisy


def gesture_pose(index: int, count: int, rng: random.Random) -> list[float]:
    denom = max(count - 1, 1)
    phase = index / denom
    x = -0.18 + 0.36 * phase
    y = 0.09 * ((index % 4) / 3.0 - 0.5)
    z = -0.035 + 0.07 * ((index % 3) / 2.0)
    yaw = -0.32 + 0.64 * phase
    pitch = 0.14 if index % 2 == 0 else -0.12
    roll = -0.16 + 0.32 * ((index % 5) / 4.0)
    grip_pattern = [0.05, 0.25, 0.62, 0.95, 0.72, 0.38, 0.12, 0.58, 0.9, 0.45, 0.18, 0.03]
    grip = grip_pattern[index % len(grip_pattern)]
    return [
        x + rng.uniform(-0.035, 0.035),
        y + rng.uniform(-0.025, 0.025),
        z + rng.uniform(-0.015, 0.015),
        yaw + rng.uniform(-0.05, 0.05),
        pitch + rng.uniform(-0.035, 0.035),
        roll + rng.uniform(-0.035, 0.035),
        clamp(grip + rng.uniform(-0.04, 0.04), 0.0, 1.0),
    ]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--count", type=int, default=5)
    parser.add_argument("--sample-ms", type=int, default=300)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--template", help="optional clean keyframe CSV to perturb with IO noise")
    parser.add_argument("--noise-scale", type=float, default=0.0, help="apply bounded IO-like error to every keyframe")
    parser.add_argument("--mode", choices=["random", "gesture"], default="random")
    args = parser.parse_args()

    if args.count < 2:
        raise ValueError("--count must be at least 2")

    rng = random.Random(args.seed)
    template_rows = load_template(Path(args.template)) if args.template else []
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    with Path(args.out).open("w", newline="") as fp:
        writer = csv.writer(fp)
        writer.writerow(["frame_id", "t_ms", "x", "y", "z", "yaw", "pitch", "roll", "grip", "hold_ms", "tolerance", "safety_hold"])
        rows_to_write = template_rows[: args.count] if template_rows else [{} for _ in range(args.count)]
        for index, row in enumerate(rows_to_write):
            if row:
                pose = [float(row[key]) for key in ("x", "y", "z", "yaw", "pitch", "roll", "grip")]
                frame_id = f"{row['frame_id']}_noisy"
                t_ms = int(row["t_ms"])
            else:
                pose = gesture_pose(index, args.count, rng) if args.mode == "gesture" else rand_pose(rng)
                frame_id = "random_init" if index == 0 else f"random_target_{index:04d}"
                t_ms = index * args.sample_ms
            pose = noisy_pose(pose, rng, args.noise_scale)
            writer.writerow([frame_id, t_ms, *pose, 0, 0.012, 0])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
