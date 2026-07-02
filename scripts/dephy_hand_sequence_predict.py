#!/usr/bin/env python3
"""Generate full high-rate hand motion segments from low-rate IO keyframes."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

from train_hand_sequence_model import pose_error


def smootherstep(t: float) -> float:
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def exact_smooth_segment(model: dict, start: list[float], target: list[float], steps: int) -> list[list[float]]:
    steps = max(1, steps)
    frames = []
    alpha = clamp(float(model.get("target_alpha", 0.25)), 0.04, 0.6)
    curve = clamp(1.0 + (0.25 - alpha) * 0.8, 0.75, 1.25)
    for index in range(steps + 1):
        t = index / steps
        s = smootherstep(t) ** curve
        frames.append([start[i] + (target[i] - start[i]) * s for i in range(7)])
    frames[-1] = target[:]
    return frames


def allocate_intervals(keyframes: list[dict], frames_between_keyframes: int | None, render_ms: int) -> list[int]:
    if frames_between_keyframes is None:
        return [max(1, (target["t_ms"] - start["t_ms"]) // render_ms) for start, target in zip(keyframes, keyframes[1:])]

    if frames_between_keyframes < 0:
        raise ValueError("--frames must be zero or greater")

    return [frames_between_keyframes + 1 for _ in zip(keyframes, keyframes[1:])]


def frame_time_ms(start_ms: int, target_ms: int, frame_index: int, intervals: int, render_ms: int, fixed_frames: bool) -> float | int:
    if frame_index >= intervals:
        return target_ms
    if fixed_frames:
        return round(start_ms + ((target_ms - start_ms) * frame_index / intervals), 3)
    return start_ms + frame_index * render_ms


def motion_metrics(frames: list[list[float]]) -> dict[str, float]:
    max_pos_jump = 0.0
    max_rot_jump = 0.0
    max_grip_jump = 0.0
    for prev, cur in zip(frames, frames[1:]):
        max_pos_jump = max(max_pos_jump, max(abs(cur[i] - prev[i]) for i in range(3)))
        max_rot_jump = max(max_rot_jump, max(abs(cur[i] - prev[i]) for i in range(3, 6)))
        max_grip_jump = max(max_grip_jump, abs(cur[6] - prev[6]))
    return {
        "max_position_jump": max_pos_jump,
        "max_rotation_jump": max_rot_jump,
        "max_grip_jump": max_grip_jump,
    }


def load_keyframes(path: Path) -> list[dict]:
    with path.open(newline="") as fp:
        return [
            {
                "frame_id": row["frame_id"],
                "t_ms": int(row["t_ms"]),
                "pose": [
                    float(row["x"]),
                    float(row["y"]),
                    float(row["z"]),
                    float(row["yaw"]),
                    float(row["pitch"]),
                    float(row["roll"]),
                    float(row["grip"]),
                ],
            }
            for row in csv.DictReader(fp)
        ]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--keyframes", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--result", required=True)
    parser.add_argument("--render-ms", type=int, default=16)
    parser.add_argument("--frames", type=int, help="generate this many predicted rows between every pair of keyframes")
    args = parser.parse_args()

    keyframes = load_keyframes(Path(args.keyframes))
    model = json.loads(Path(args.model).read_text())
    rows = []
    all_poses = []
    if len(keyframes) < 2:
        raise ValueError("need at least two keyframes")

    intervals_by_segment = allocate_intervals(keyframes, args.frames, args.render_ms)
    for segment_index, (start, target) in enumerate(zip(keyframes, keyframes[1:])):
        intervals = intervals_by_segment[segment_index]
        frames = exact_smooth_segment(model, start["pose"], target["pose"], intervals)
        frame_indexes = range(len(frames)) if segment_index == 0 else range(1, len(frames))
        for frame_index in frame_indexes:
            pose = frames[frame_index]
            t_ms = frame_time_ms(start["t_ms"], target["t_ms"], frame_index, intervals, args.render_ms, args.frames is not None)
            rows.append([t_ms, target["frame_id"], *pose])
            all_poses.append(pose)

    final_error = pose_error(all_poses[-1], keyframes[-1]["pose"])
    metrics = motion_metrics(all_poses)
    success = (
        final_error <= 0.000001
        and metrics["max_position_jump"] <= 0.03
        and metrics["max_rotation_jump"] <= 0.08
        and metrics["max_grip_jump"] <= 0.08
    )
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    with Path(args.out).open("w", newline="") as fp:
        writer = csv.writer(fp)
        writer.writerow(["frame_t_ms", "target_frame", "palm_x", "palm_y", "palm_z", "yaw", "pitch", "roll", "grip"])
        writer.writerows(rows)
    Path(args.result).write_text(
        json.dumps(
            {
                "format": "dephy_hand_sequence_result_v1",
                "model": model.get("format"),
                "keyframes": len(keyframes),
                "prediction_frames": len(rows),
                "frames_between_keyframes": args.frames,
                "intermediate_prediction_frames": (len(keyframes) - 1) * args.frames if args.frames is not None else None,
                "render_ms": args.render_ms,
                "final_error": final_error,
                **metrics,
                "success": success,
            },
            indent=2,
            sort_keys=True,
        )
        + "\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
