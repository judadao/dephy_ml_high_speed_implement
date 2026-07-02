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


def grasp_can_keyframe(index: int, count: int, rng: random.Random) -> tuple[str, list[float]]:
    path = [
        ("home_open", [-0.26, -0.08, 0.015, -0.30, 0.06, -0.08, 0.02]),
        ("lift_open", [-0.23, -0.035, 0.03, -0.26, 0.05, -0.18, 0.02]),
        ("reach_far_open", [-0.18, 0.015, 0.035, -0.22, 0.04, -0.34, 0.03]),
        ("reach_mid_open", [-0.12, 0.065, 0.035, -0.16, 0.03, -0.58, 0.04]),
        ("reach_near_open", [-0.05, 0.105, 0.03, -0.10, 0.02, -0.82, 0.05]),
        ("rotate_pregrasp", [-0.005, 0.122, 0.027, -0.070, 0.014, -1.05, 0.055]),
        ("pregrasp_left_horizontal", [0.020, 0.132, 0.025, -0.050, 0.010, -1.22, 0.06]),
        ("pregrasp_center_horizontal", [0.050, 0.142, 0.020, -0.025, 0.006, -1.32, 0.08]),
        ("palm_at_can_horizontal", [0.073, 0.146, 0.018, -0.008, 0.000, -1.36, 0.10]),
        ("contact_can_horizontal", [0.083, 0.146, 0.018, 0.000, -0.004, -1.38, 0.16]),
        ("touch_can_10_horizontal", [0.086, 0.146, 0.018, 0.002, -0.006, -1.39, 0.24]),
        ("wrap_can_25_horizontal", [0.088, 0.146, 0.018, 0.004, -0.008, -1.40, 0.36]),
        ("wrap_can_40_horizontal", [0.089, 0.146, 0.018, 0.006, -0.010, -1.40, 0.50]),
        ("wrap_can_60_horizontal", [0.089, 0.146, 0.018, 0.008, -0.010, -1.40, 0.66]),
        ("wrap_can_80_horizontal", [0.088, 0.145, 0.018, 0.010, -0.010, -1.39, 0.82]),
        ("grasp_can_closed_horizontal", [0.087, 0.145, 0.018, 0.012, -0.010, -1.38, 0.98]),
        ("hold_can_closed_01_horizontal", [0.087, 0.145, 0.018, 0.012, -0.010, -1.38, 1.00]),
        ("hold_can_closed_02_horizontal", [0.086, 0.145, 0.018, 0.010, -0.009, -1.38, 1.00]),
        ("hold_can_closed_03_horizontal", [0.085, 0.145, 0.018, 0.008, -0.008, -1.36, 0.96]),
        ("release_can_80_horizontal", [0.084, 0.144, 0.018, 0.006, -0.006, -1.32, 0.80]),
        ("release_can_60_horizontal", [0.082, 0.143, 0.019, 0.004, -0.004, -1.22, 0.60]),
        ("release_can_40_horizontal", [0.076, 0.140, 0.020, 0.000, -0.002, -1.05, 0.40]),
        ("release_can_20_horizontal", [0.064, 0.135, 0.022, -0.006, 0.000, -0.82, 0.22]),
        ("open_clear_can_unrotate", [0.040, 0.124, 0.025, -0.020, 0.006, -0.58, 0.10]),
        ("retreat_near_open", [0.000, 0.100, 0.030, -0.050, 0.014, -0.36, 0.06]),
        ("retreat_mid_open", [-0.080, 0.050, 0.032, -0.120, 0.030, -0.20, 0.04]),
        ("return_home_open", [-0.170, -0.020, 0.026, -0.210, 0.045, -0.12, 0.03]),
        ("home_open_return", [-0.26, -0.08, 0.015, -0.30, 0.06, -0.08, 0.02]),
    ]
    if count <= len(path):
        name, pose = path[min(index, len(path) - 1)]
        pose = pose[:]
    else:
        scaled = index * (len(path) - 1) / max(count - 1, 1)
        low = int(scaled)
        high = min(low + 1, len(path) - 1)
        t = scaled - low
        name = f"{path[low][0]}_to_{path[high][0]}_{index:04d}"
        pose = [path[low][1][axis] + (path[high][1][axis] - path[low][1][axis]) * t for axis in range(7)]
    noisy = [
        pose[0] + rng.uniform(-0.01, 0.01),
        pose[1] + rng.uniform(-0.008, 0.008),
        pose[2] + rng.uniform(-0.006, 0.006),
        pose[3] + rng.uniform(-0.015, 0.015),
        pose[4] + rng.uniform(-0.012, 0.012),
        pose[5] + rng.uniform(-0.012, 0.012),
        clamp(pose[6] + rng.uniform(-0.025, 0.025), 0.0, 1.0),
    ]
    return name, noisy


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--count", type=int, default=5)
    parser.add_argument("--sample-ms", type=int, default=300)
    parser.add_argument("--seed", type=int, default=None)
    parser.add_argument("--template", help="optional clean keyframe CSV to perturb with IO noise")
    parser.add_argument("--noise-scale", type=float, default=0.0, help="apply bounded IO-like error to every keyframe")
    parser.add_argument("--mode", choices=["random", "gesture", "grasp_can"], default="random")
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
                if args.mode == "grasp_can":
                    frame_id, pose = grasp_can_keyframe(index, args.count, rng)
                elif args.mode == "gesture":
                    pose = gesture_pose(index, args.count, rng)
                    frame_id = "random_init" if index == 0 else f"random_target_{index:04d}"
                else:
                    pose = rand_pose(rng)
                    frame_id = "random_init" if index == 0 else f"random_target_{index:04d}"
                t_ms = index * args.sample_ms
            effective_noise = args.noise_scale * 0.35 if args.mode == "grasp_can" else args.noise_scale
            pose = noisy_pose(pose, rng, effective_noise)
            writer.writerow([frame_id, t_ms, *pose, 0, 0.012, 0])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
