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
        ("rotate_pregrasp", [-0.010, 0.120, -0.004, -0.070, 0.014, -1.03, 0.055]),
        ("pregrasp_behind_left", [-0.018, 0.132, -0.020, -0.050, 0.010, -1.18, 0.06]),
        ("pregrasp_behind_center", [-0.004, 0.142, -0.034, -0.025, 0.006, -1.30, 0.08]),
        ("palm_behind_can_open", [0.006, 0.146, -0.044, -0.008, 0.000, -1.34, 0.10]),
        ("palm_behind_can_settle", [0.008, 0.146, -0.047, -0.004, -0.002, -1.35, 0.12]),
        ("finger_contact_back_surface", [0.012, 0.146, -0.049, 0.000, -0.004, -1.36, 0.16]),
        ("finger_contact_confirm_back", [0.014, 0.146, -0.050, 0.001, -0.005, -1.365, 0.20]),
        ("thumb_touch_back_surface", [0.016, 0.146, -0.050, 0.002, -0.006, -1.37, 0.24]),
        ("thumb_pad_settle_back", [0.018, 0.146, -0.050, 0.003, -0.007, -1.375, 0.30]),
        ("wrap_can_25_back", [0.020, 0.146, -0.050, 0.004, -0.008, -1.38, 0.36]),
        ("wrap_can_32_back", [0.021, 0.146, -0.050, 0.005, -0.009, -1.38, 0.43]),
        ("wrap_can_40_back", [0.023, 0.146, -0.050, 0.006, -0.010, -1.38, 0.50]),
        ("wrap_can_50_back", [0.024, 0.146, -0.050, 0.007, -0.010, -1.38, 0.58]),
        ("wrap_can_60_back", [0.025, 0.146, -0.050, 0.008, -0.010, -1.38, 0.66]),
        ("wrap_can_70_back", [0.026, 0.1455, -0.050, 0.009, -0.010, -1.375, 0.74]),
        ("wrap_can_80_back", [0.026, 0.145, -0.050, 0.010, -0.010, -1.37, 0.82]),
        ("wrap_can_90_back", [0.026, 0.145, -0.050, 0.011, -0.010, -1.365, 0.91]),
        ("grasp_can_closed_back", [0.026, 0.145, -0.050, 0.012, -0.010, -1.36, 0.98]),
        ("hold_can_closed_01_back", [0.026, 0.145, -0.050, 0.012, -0.010, -1.36, 1.00]),
        ("hold_can_closed_02_back", [0.026, 0.145, -0.050, 0.011, -0.010, -1.36, 1.00]),
        ("hold_can_closed_03_back", [0.0255, 0.145, -0.050, 0.010, -0.0095, -1.36, 1.00]),
        ("hold_can_closed_04_back", [0.025, 0.145, -0.050, 0.010, -0.009, -1.36, 1.00]),
        ("hold_can_closed_05_back", [0.0245, 0.145, -0.050, 0.009, -0.0085, -1.35, 1.00]),
        ("hold_can_closed_06_back", [0.024, 0.145, -0.050, 0.008, -0.008, -1.34, 0.98]),
        ("release_can_80_back", [0.023, 0.144, -0.050, 0.006, -0.006, -1.31, 0.80]),
        ("release_can_70_back", [0.022, 0.1435, -0.049, 0.005, -0.005, -1.27, 0.70]),
        ("release_can_60_back", [0.021, 0.143, -0.048, 0.004, -0.004, -1.23, 0.60]),
        ("release_can_50_back", [0.020, 0.1415, -0.046, 0.002, -0.003, -1.18, 0.50]),
        ("release_can_40_back", [0.018, 0.140, -0.043, 0.000, -0.002, -1.12, 0.40]),
        ("release_can_30_back", [0.016, 0.1375, -0.038, -0.003, -0.001, -1.04, 0.30]),
        ("release_can_20_back", [0.014, 0.135, -0.033, -0.006, 0.000, -0.96, 0.22]),
        ("open_hover_behind_can", [0.012, 0.130, -0.030, -0.012, 0.004, -0.86, 0.12]),
        ("hover_near_can_open", [0.006, 0.122, -0.026, -0.020, 0.008, -0.76, 0.08]),
        ("hover_near_can_stable", [0.000, 0.114, -0.022, -0.032, 0.010, -0.66, 0.06]),
        ("return_near_can_open", [-0.010, 0.104, -0.016, -0.045, 0.014, -0.56, 0.05]),
        ("home_near_can_open", [-0.025, 0.092, -0.008, -0.060, 0.018, -0.46, 0.04]),
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
    pose = keep_grasp_palm_behind_can(pose)
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


def keep_grasp_palm_behind_can(pose: list[float]) -> list[float]:
    """Keep palm keyframes behind the can so the web rig does not deform the palm."""
    x, y, z, yaw, pitch, roll, grip = pose
    near_can = y > 0.06 or roll < -0.45 or grip > 0.12
    if not near_can:
        return pose
    closure = clamp((grip - 0.12) / 0.88, 0.0, 1.0)
    rotation_close = clamp((-roll - 0.55) / 0.85, 0.0, 1.0)
    behind = max(closure, rotation_close)
    target_z = -0.14 - 0.05 * behind
    pose[2] = min(z, target_z)
    pose[0] = x - 0.04 * behind
    pose[5] = roll + 0.12 * behind
    return pose


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
