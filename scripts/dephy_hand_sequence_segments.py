#!/usr/bin/env python3
"""Generate per-keyframe realtime prediction segment batches."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from dephy_hand_sequence_predict import (
    allocate_intervals,
    exact_smooth_segment,
    frame_time_ms,
    load_keyframes,
    motion_metrics,
)
from train_hand_sequence_model import pose_error


def frame_object(t_ms: float | int, target_frame: str, pose: list[float], csv_line: int) -> dict:
    return {
        "frame_t_ms": t_ms,
        "target_frame": target_frame,
        "palm_x": pose[0],
        "palm_y": pose[1],
        "palm_z": pose[2],
        "yaw": pose[3],
        "pitch": pose[4],
        "roll": pose[5],
        "grip": pose[6],
        "csvLine": csv_line,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--keyframes", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--result", required=True)
    parser.add_argument("--render-ms", type=int, default=16)
    parser.add_argument("--frames", type=int, default=1000, help="predicted rows between every keyframe pair")
    args = parser.parse_args()

    keyframes = load_keyframes(Path(args.keyframes))
    model = json.loads(Path(args.model).read_text())
    if len(keyframes) < 2:
        raise ValueError("need at least two keyframes")

    intervals_by_segment = allocate_intervals(keyframes, args.frames, args.render_ms)
    segments = []
    all_poses = []
    csv_line = 2

    for segment_index, (start, target) in enumerate(zip(keyframes, keyframes[1:])):
        intervals = intervals_by_segment[segment_index]
        poses = exact_smooth_segment(model, start["pose"], target["pose"], intervals)
        frame_indexes = range(len(poses)) if segment_index == 0 else range(1, len(poses))
        frames = []
        for frame_index in frame_indexes:
            pose = poses[frame_index]
            t_ms = frame_time_ms(start["t_ms"], target["t_ms"], frame_index, intervals, args.render_ms, True)
            frames.append(frame_object(t_ms, target["frame_id"], pose, csv_line))
            all_poses.append(pose)
            csv_line += 1
        segments.append(
            {
                "format": "dephy_prediction_segment_v1",
                "segment_index": segment_index,
                "from": start["frame_id"],
                "to": target["frame_id"],
                "start_t_ms": start["t_ms"],
                "target_t_ms": target["t_ms"],
                "frames_between_keyframes": args.frames,
                "frames": frames,
            }
        )

    final_error = pose_error(all_poses[-1], keyframes[-1]["pose"])
    metrics = motion_metrics(all_poses)
    success = (
        final_error <= 0.000001
        and metrics["max_position_jump"] <= 0.03
        and metrics["max_rotation_jump"] <= 0.08
        and metrics["max_grip_jump"] <= 0.08
    )

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w") as fp:
        for segment in segments:
            fp.write(json.dumps(segment, separators=(",", ":"), sort_keys=True) + "\n")

    Path(args.result).write_text(
        json.dumps(
            {
                "format": "dephy_prediction_segments_result_v1",
                "model": model.get("format"),
                "keyframes": len(keyframes),
                "segments": len(segments),
                "prediction_frames": sum(len(segment["frames"]) for segment in segments),
                "frames_between_keyframes": args.frames,
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
