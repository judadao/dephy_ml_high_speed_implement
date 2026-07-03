#!/usr/bin/env python3
"""Watch an appended hand keyframe CSV and emit realtime prediction segments."""

from __future__ import annotations

import argparse
import csv
import json
import time
from pathlib import Path

from dephy_hand_sequence_predict import exact_smooth_segment, motion_metrics
from train_hand_sequence_model import pose_error


FIELDS = ["x", "y", "z", "yaw", "pitch", "roll", "grip"]


def load_model(path: Path) -> dict:
    return json.loads(path.read_text())


def load_keyframes(path: Path) -> list[dict]:
    if not path.exists() or path.stat().st_size == 0:
        return []
    with path.open(newline="") as fp:
        rows = []
        for row in csv.DictReader(fp):
            if not row.get("frame_id"):
                continue
            rows.append(
                {
                    "frame_id": row["frame_id"],
                    "t_ms": int(float(row["t_ms"])),
                    "pose": [float(row[field]) for field in FIELDS],
                }
            )
        return rows


def pose_to_keyframe(frame_id: str, t_ms: int, pose: list[float]) -> dict:
    return {
        "frame_id": frame_id,
        "t_ms": int(t_ms),
        "pose": pose[:],
    }


def extrapolate_target(keyframes: list[dict], sample_ms: int, segment_index: int) -> dict:
    current = keyframes[-1]
    target_t = current["t_ms"] + sample_ms
    if len(keyframes) >= 2:
        previous = keyframes[-2]
        scale = sample_ms / max(current["t_ms"] - previous["t_ms"], 1)
        pose = [current["pose"][axis] + (current["pose"][axis] - previous["pose"][axis]) * scale for axis in range(7)]
        pose[6] = max(0.0, min(1.0, pose[6]))
    else:
        pose = current["pose"][:]
        pose[1] += 0.006
        pose[6] = max(0.0, min(1.0, pose[6] + 0.08))
    return pose_to_keyframe(f"predicted_bootstrap_{segment_index:04d}", target_t, pose)


def frame_object(t_ms: float | int, target_frame: str, pose: list[float], csv_line: int) -> dict:
    return {
        "csvLine": csv_line,
        "frame_t_ms": t_ms,
        "target_frame": target_frame,
        "palm_x": pose[0],
        "palm_y": pose[1],
        "palm_z": pose[2],
        "yaw": pose[3],
        "pitch": pose[4],
        "roll": pose[5],
        "grip": pose[6],
    }


def frame_time(start_ms: int, target_ms: int, frame_index: int, intervals: int) -> float | int:
    if frame_index >= intervals:
        return target_ms
    return round(start_ms + ((target_ms - start_ms) * frame_index / intervals), 3)


def make_segment(
    model: dict,
    segment_index: int,
    segment_type: str,
    source: str,
    start: dict,
    target: dict,
    frames_between: int,
    csv_line: int,
    confidence: float,
    is_predicted_target: bool,
    is_corrected: bool,
) -> tuple[dict, int, list[list[float]]]:
    intervals = frames_between + 1
    poses = exact_smooth_segment(model, start["pose"], target["pose"], intervals)
    frames = []
    for frame_index, pose in enumerate(poses):
        frames.append(frame_object(frame_time(start["t_ms"], target["t_ms"], frame_index, intervals), target["frame_id"], pose, csv_line))
        csv_line += 1
    segment = {
        "format": "dephy_prediction_segment_v1",
        "segment_index": segment_index,
        "segment_type": segment_type,
        "source": source,
        "from": {"frame_id": start["frame_id"], "t_ms": start["t_ms"]},
        "to": {"frame_id": target["frame_id"], "t_ms": target["t_ms"]},
        "start_t_ms": start["t_ms"],
        "target_t_ms": target["t_ms"],
        "frames_between_keyframes": frames_between,
        "confidence": confidence,
        "is_predicted_target": is_predicted_target,
        "is_corrected": is_corrected,
        "frames": frames,
    }
    return segment, csv_line, poses


def write_segment(path: Path, segment: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as fp:
        fp.write(json.dumps(segment, separators=(",", ":"), sort_keys=True) + "\n")
        fp.flush()


def write_result(path: Path, result: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    tmp.replace(path)


def pose_from_frame(frame: dict) -> list[float]:
    return [frame["palm_x"], frame["palm_y"], frame["palm_z"], frame["yaw"], frame["pitch"], frame["roll"], frame["grip"]]


def segment_motion_metrics(segments: list[dict]) -> dict[str, float]:
    aggregate = {"max_position_jump": 0.0, "max_rotation_jump": 0.0, "max_grip_jump": 0.0}
    for segment in segments:
        poses = [pose_from_frame(frame) for frame in segment["frames"]]
        metrics = motion_metrics(poses) if len(poses) >= 2 else aggregate
        for key in aggregate:
            aggregate[key] = max(aggregate[key], metrics[key])
    return aggregate


def update_result(
    path: Path,
    model: dict,
    keyframes_seen: int,
    segments: list[dict],
    last_error: float,
    render_ms: int,
    frames_between: int,
) -> None:
    counts = {"bootstrap": 0, "confirmed": 0, "correction": 0}
    for segment in segments:
        segment_type = segment.get("segment_type", "confirmed")
        counts[segment_type] = counts.get(segment_type, 0) + 1
    metrics = segment_motion_metrics(segments)
    write_result(
        path,
        {
            "format": "dephy_realtime_prediction_result_v1",
            "mode": "realtime",
            "model": model.get("format"),
            "keyframes_seen": keyframes_seen,
            "segments_written": len(segments),
            "bootstrap_segments": counts.get("bootstrap", 0),
            "confirmed_segments": counts.get("confirmed", 0),
            "correction_segments": counts.get("correction", 0),
            "last_keyframe": segments[-1]["to"]["frame_id"] if segments else None,
            "last_segment_type": segments[-1]["segment_type"] if segments else None,
            "prediction_frames": sum(len(segment["frames"]) for segment in segments),
            "frames_between_keyframes": frames_between,
            "render_ms": render_ms,
            "last_error": last_error,
            **metrics,
            "success": last_error <= 0.000001 and metrics["max_position_jump"] <= 0.03 and metrics["max_rotation_jump"] <= 0.08 and metrics["max_grip_jump"] <= 0.08,
        },
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--keyframes", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--result", required=True)
    parser.add_argument("--render-ms", type=int, default=16)
    parser.add_argument("--sample-ms", type=int, default=300)
    parser.add_argument("--frames", type=int, default=1000)
    parser.add_argument("--poll-ms", type=int, default=100)
    parser.add_argument("--max-keyframes", type=int)
    parser.add_argument("--idle-exit-ms", type=int, help="exit after this much idle time once at least one keyframe was seen")
    parser.add_argument("--truncate", action="store_true", help="truncate output and result before watching")
    parser.add_argument("--correction-threshold", type=float, default=0.02)
    args = parser.parse_args()

    model = load_model(Path(args.model))
    keyframe_path = Path(args.keyframes)
    out_path = Path(args.out)
    result_path = Path(args.result)
    if args.truncate:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text("")
        result_path.parent.mkdir(parents=True, exist_ok=True)
        result_path.write_text("")

    processed_pairs = 0
    bootstrap_target: dict | None = None
    bootstrap_pose: list[float] | None = None
    bootstrap_written = False
    segment_index = 0
    csv_line = 2
    written_segments: list[dict] = []
    last_error = 0.0
    last_seen_count = 0
    last_activity = time.monotonic()

    while True:
        keyframes = load_keyframes(keyframe_path)
        if len(keyframes) != last_seen_count:
            last_seen_count = len(keyframes)
            last_activity = time.monotonic()

        if keyframes and not bootstrap_written:
            bootstrap_target = extrapolate_target(keyframes[:1], args.sample_ms, segment_index)
            segment, csv_line, poses = make_segment(
                model,
                segment_index,
                "bootstrap",
                "realtime_keyframe_stream",
                keyframes[0],
                bootstrap_target,
                args.frames,
                csv_line,
                0.35,
                True,
                False,
            )
            write_segment(out_path, segment)
            written_segments.append(segment)
            bootstrap_pose = bootstrap_target["pose"][:]
            bootstrap_written = True
            segment_index += 1
            update_result(result_path, model, len(keyframes), written_segments, last_error, args.render_ms, args.frames)

        while processed_pairs < max(0, len(keyframes) - 1):
            start = keyframes[processed_pairs]
            target = keyframes[processed_pairs + 1]
            if processed_pairs == 0 and bootstrap_pose is not None:
                correction_error = pose_error(bootstrap_pose, target["pose"])
                if correction_error > args.correction_threshold:
                    correction_start = pose_to_keyframe(f"bootstrap_displayed_{processed_pairs:04d}", start["t_ms"], bootstrap_pose)
                    segment, csv_line, poses = make_segment(
                        model,
                        segment_index,
                        "correction",
                        "realtime_keyframe_stream",
                        correction_start,
                        target,
                        args.frames,
                        csv_line,
                        0.75,
                        False,
                        True,
                    )
                    write_segment(out_path, segment)
                    written_segments.append(segment)
                    segment_index += 1
            segment, csv_line, poses = make_segment(
                model,
                segment_index,
                "confirmed",
                "realtime_keyframe_stream",
                start,
                target,
                args.frames,
                csv_line,
                0.98,
                False,
                False,
            )
            last_error = pose_error(poses[-1], target["pose"])
            write_segment(out_path, segment)
            written_segments.append(segment)
            segment_index += 1
            processed_pairs += 1
            update_result(result_path, model, len(keyframes), written_segments, last_error, args.render_ms, args.frames)

        update_result(result_path, model, len(keyframes), written_segments, last_error, args.render_ms, args.frames)

        if args.max_keyframes is not None and len(keyframes) >= args.max_keyframes and processed_pairs >= max(0, args.max_keyframes - 1):
            break
        if args.idle_exit_ms is not None and keyframes and (time.monotonic() - last_activity) * 1000 >= args.idle_exit_ms:
            break
        time.sleep(max(args.poll_ms, 10) / 1000)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
